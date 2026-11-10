// Pimp My Prompt's Windows helper: the counterpart of axhelper.swift.
//
//   winhelper focused                 the foreground app, its window and the focused field (JSON)
//   winhelper activate <hwnd>         bring that window back to the foreground
//   winhelper set <hwnd>  < text      write the text into the focused field (UI Automation ValuePattern)
//   winhelper paste <hwnd> all|selection   Ctrl+A (if all) then Ctrl+V into that window
//   winhelper copy                    Ctrl+C in the foreground window
//   winhelper selftest                wait 3 seconds, then print what `focused` sees (for debugging)
//
// Every command prints one JSON line. Errors print {"error": "..."} and exit non-zero.
// Keystrokes wait until the user has let go of Ctrl, Alt, Shift and Win, so the hotkey's own
// modifiers never combine with them. Password fields are never read.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace PimpMyPrompt
{
    internal static class Program
    {
        const int MaxText = 50000;

        static int Main(string[] args)
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            try
            {
                string cmd = args.Length > 0 ? args[0] : "";
                switch (cmd)
                {
                    case "focused": Write(Focused()); return 0;
                    case "activate": Write(new Dictionary<string, object> { ["ok"] = Activate(Hwnd(args)) }); return 0;
                    case "set": Write(SetValue(Hwnd(args), ReadStdin())); return 0;
                    case "paste": Write(Paste(Hwnd(args), args.Length > 2 && args[2] == "all")); return 0;
                    case "copy": Write(Copy()); return 0;
                    case "selftest":
                        Console.Error.WriteLine("Click into a text field within 3 seconds...");
                        Thread.Sleep(3000);
                        Write(Focused());
                        return 0;
                    default:
                        Write(Error("usage: winhelper focused|activate|set|paste|copy|selftest"));
                        return 2;
                }
            }
            catch (Exception e)
            {
                Write(Error(e.GetType().Name + ": " + e.Message));
                return 1;
            }
        }

        // ---------- focused ----------

        static Dictionary<string, object> Focused()
        {
            IntPtr hwnd = Native.GetForegroundWindow();
            uint pid;
            Native.GetWindowThreadProcessId(hwnd, out pid);
            string title = WindowTitle(hwnd);
            var result = new Dictionary<string, object>
            {
                ["hwnd"] = hwnd.ToInt64(),
                ["pid"] = (long)pid,
                ["app"] = AppName(pid, title),
                ["bundleId"] = ExeName(pid),
                ["title"] = title,
                ["role"] = "",
                ["value"] = "",
                ["selectedText"] = "",
                ["valueSettable"] = false,
            };
            Native.RECT r;
            if (Native.DwmGetWindowAttribute(hwnd, 9 /* DWMWA_EXTENDED_FRAME_BOUNDS */, out r, Marshal.SizeOf(typeof(Native.RECT))) == 0 || Native.GetWindowRect(hwnd, out r))
            {
                result["bounds"] = new Dictionary<string, object> { ["x"] = (long)r.Left, ["y"] = (long)r.Top, ["w"] = (long)(r.Right - r.Left), ["h"] = (long)(r.Bottom - r.Top) };
            }

            AutomationElement el = null;
            try { el = AutomationElement.FocusedElement; } catch (Exception e) { result["diagnostics"] = new Dictionary<string, object> { ["focusError"] = e.Message }; }
            if (el == null) return result;

            var diagnostics = new Dictionary<string, object>();
            try
            {
                var c = el.Current;
                diagnostics["framework"] = c.FrameworkId ?? "";
                diagnostics["elementPid"] = (long)c.ProcessId;
                diagnostics["className"] = c.ClassName ?? "";
                result["role"] = (c.ControlType != null ? c.ControlType.ProgrammaticName : "").Replace("ControlType.", "");
                if (!string.IsNullOrEmpty(c.HelpText)) result["placeholder"] = c.HelpText;
                if (c.IsPassword)
                {
                    diagnostics["password"] = true; // never read password fields
                    result["diagnostics"] = diagnostics;
                    return result;
                }
                string value = "";
                object pattern;
                if (el.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
                {
                    var vp = (ValuePattern)pattern;
                    value = vp.Current.Value ?? "";
                    result["valueSettable"] = !vp.Current.IsReadOnly;
                }
                if (el.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
                {
                    var tp = (TextPattern)pattern;
                    if (string.IsNullOrEmpty(value)) value = tp.DocumentRange.GetText(MaxText) ?? "";
                    var selected = new StringBuilder();
                    try
                    {
                        foreach (TextPatternRange range in tp.GetSelection()) selected.Append(range.GetText(MaxText));
                    }
                    catch { /* some providers throw when nothing is selected */ }
                    result["selectedText"] = selected.ToString();
                    diagnostics["textPattern"] = true;
                }
                if (value.Length > MaxText) value = value.Substring(0, MaxText);
                result["value"] = value.Replace("\r\n", "\n").Replace('\r', '\n');
                result["selectedText"] = ((string)result["selectedText"]).Replace("\r\n", "\n").Replace('\r', '\n');
            }
            catch (Exception e)
            {
                diagnostics["readError"] = e.Message;
            }
            result["diagnostics"] = diagnostics;
            return result;
        }

        static string WindowTitle(IntPtr hwnd)
        {
            var sb = new StringBuilder(512);
            Native.GetWindowText(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        static string ExeName(uint pid)
        {
            try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
        }

        /** A friendly name: "Visual Studio Code", "Google Chrome", "Notepad". */
        static string AppName(uint pid, string title)
        {
            string exe = ExeName(pid);
            if (exe.Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) return string.IsNullOrEmpty(title) ? "this app" : title;
            try
            {
                string description = Process.GetProcessById((int)pid).MainModule.FileVersionInfo.FileDescription;
                if (!string.IsNullOrWhiteSpace(description)) return description.Trim();
            }
            catch { /* elevated or protected process */ }
            return string.IsNullOrEmpty(exe) ? "this app" : exe;
        }

        // ---------- activate ----------

        static bool Activate(IntPtr hwnd)
        {
            if (!Native.IsWindow(hwnd)) return false;
            if (Native.IsIconic(hwnd)) Native.ShowWindow(hwnd, 9 /* SW_RESTORE */);
            if (Native.GetForegroundWindow() == hwnd) return true;

            IntPtr foreground = Native.GetForegroundWindow();
            uint ignored;
            uint foregroundThread = Native.GetWindowThreadProcessId(foreground, out ignored);
            uint me = Native.GetCurrentThreadId();
            bool attached = foregroundThread != 0 && foregroundThread != me && Native.AttachThreadInput(me, foregroundThread, true);
            try
            {
                Native.BringWindowToTop(hwnd);
                Native.SetForegroundWindow(hwnd);
            }
            finally
            {
                if (attached) Native.AttachThreadInput(me, foregroundThread, false);
            }
            if (Native.GetForegroundWindow() != hwnd)
            {
                // Windows only lets the process that received the last input take the foreground; a
                // synthetic Shift tap counts as input and is harmless in every app.
                Keys.Tap(Native.VK_SHIFT);
                Native.SetForegroundWindow(hwnd);
            }
            for (int i = 0; i < 25 && Native.GetForegroundWindow() != hwnd; i++) Thread.Sleep(15);
            return Native.GetForegroundWindow() == hwnd;
        }

        // ---------- set ----------

        static Dictionary<string, object> SetValue(IntPtr hwnd, string text)
        {
            bool active = Activate(hwnd);
            Thread.Sleep(80);
            var result = new Dictionary<string, object> { ["set"] = false, ["value"] = "", ["active"] = active };
            AutomationElement el = AutomationElement.FocusedElement;
            object pattern;
            if (el == null || !el.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            {
                result["reason"] = "the focused field does not accept a direct write";
                return result;
            }
            var vp = (ValuePattern)pattern;
            if (vp.Current.IsReadOnly)
            {
                result["reason"] = "the focused field is read-only";
                return result;
            }
            vp.SetValue(text.Replace("\r\n", "\n").Replace("\n", "\r\n"));
            Thread.Sleep(60);
            result["set"] = true;
            result["value"] = (vp.Current.Value ?? "").Replace("\r\n", "\n");
            return result;
        }

        // ---------- keyboard ----------

        static Dictionary<string, object> Paste(IntPtr hwnd, bool selectAll)
        {
            bool active = Activate(hwnd);
            Keys.WaitForModifiersReleased();
            if (selectAll)
            {
                Keys.Chord(Native.VK_CONTROL, 0x41 /* A */);
                Thread.Sleep(60);
            }
            Keys.Chord(Native.VK_CONTROL, 0x56 /* V */);
            Thread.Sleep(120);
            return new Dictionary<string, object> { ["ok"] = true, ["active"] = active };
        }

        static Dictionary<string, object> Copy()
        {
            Keys.WaitForModifiersReleased();
            Keys.Chord(Native.VK_CONTROL, 0x43 /* C */);
            Thread.Sleep(150);
            return new Dictionary<string, object> { ["ok"] = true };
        }

        // ---------- plumbing ----------

        static IntPtr Hwnd(string[] args)
        {
            long value;
            if (args.Length < 2 || !long.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value)) throw new ArgumentException("missing window handle");
            return new IntPtr(value);
        }

        static string ReadStdin()
        {
            using (var reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false))) return reader.ReadToEnd();
        }

        static Dictionary<string, object> Error(string message) => new Dictionary<string, object> { ["error"] = message };

        static void Write(Dictionary<string, object> value)
        {
            var sb = new StringBuilder();
            Json.Append(sb, value);
            Console.Out.Write(sb.ToString());
            Console.Out.Write("\n");
            Console.Out.Flush();
        }
    }

    internal static class Keys
    {
        public static void WaitForModifiersReleased()
        {
            int[] modifiers = { Native.VK_SHIFT, Native.VK_CONTROL, Native.VK_MENU, Native.VK_LWIN, Native.VK_RWIN };
            for (int i = 0; i < 100; i++)
            {
                bool held = false;
                foreach (int vk in modifiers) if ((Native.GetAsyncKeyState(vk) & 0x8000) != 0) held = true;
                if (!held) return;
                Thread.Sleep(15);
            }
        }

        public static void Tap(int vk)
        {
            Send(new[] { Key(vk, false), Key(vk, true) });
        }

        public static void Chord(int modifier, int key)
        {
            Send(new[] { Key(modifier, false), Key(key, false), Key(key, true), Key(modifier, true) });
        }

        static Native.INPUT Key(int vk, bool up)
        {
            var input = new Native.INPUT { type = 1 /* INPUT_KEYBOARD */ };
            input.U.ki = new Native.KEYBDINPUT { wVk = (ushort)vk, dwFlags = up ? 2u /* KEYEVENTF_KEYUP */ : 0u };
            return input;
        }

        static void Send(Native.INPUT[] inputs)
        {
            uint sent = Native.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Native.INPUT)));
            if (sent != inputs.Length) throw new InvalidOperationException("Windows blocked the keystrokes (is the target app running as administrator?)");
        }
    }

    internal static class Json
    {
        public static void Append(StringBuilder sb, object value)
        {
            switch (value)
            {
                case null: sb.Append("null"); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); break;
                case int i: sb.Append(i.ToString(CultureInfo.InvariantCulture)); break;
                case string s: AppendString(sb, s); break;
                case Dictionary<string, object> d:
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in d)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        AppendString(sb, kv.Key);
                        sb.Append(':');
                        Append(sb, kv.Value);
                    }
                    sb.Append('}');
                    break;
                default: AppendString(sb, value.ToString()); break;
            }
        }

        static void AppendString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    internal static class Native
    {
        public const int VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_LWIN = 0x5B, VK_RWIN = 0x5C;

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT { public uint type; public InputUnion U; }

        [StructLayout(LayoutKind.Explicit)]
        public struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)]
        public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
        [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint nInputs, INPUT[] inputs, int size);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
        [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT value, int size);
    }
}
