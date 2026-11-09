# The physical button

A single key that types `Alt+Shift+P`. The computer sees a plain USB keyboard; the extension's
`chrome.commands` shortcut and the web playground's key listener both react to the chord.

## Parts (≈ €10)

- Any CircuitPython board with native USB: Raspberry Pi Pico (€5) is the easiest; an ESP32-S3 dev board works too.
- One momentary switch. A 30 mm arcade button feels best on stage; a Cherry MX switch + keycap is the compact option.
- Two jumper wires. No resistor — the firmware enables the internal pull-up.

## Flash

1. Hold BOOTSEL, plug the Pico in, copy the CircuitPython `.uf2` from <https://circuitpython.org/board/raspberry_pi_pico/> onto the `RPI-RP2` drive. It reboots as `CIRCUITPY`.
2. Download the CircuitPython library bundle and copy `lib/adafruit_hid/` into `CIRCUITPY/lib/`.
3. Copy [`code.py`](code.py) to `CIRCUITPY/code.py`. It starts immediately and restarts on every save.

## Wire

| Switch leg | Pico pin |
|---|---|
| one side | `GP15` (physical pin 20) |
| other side | any `GND` (physical pin 18 or 23) |

Using a different pin or board: change `BUTTON_PIN` at the top of `code.py`.

## Try it

Open the playground or claude.ai with the extension loaded, type a draft, press the button. The on-board LED
blinks on each send. If nothing happens, open any text field and press the button: `Alt+Shift+P` should type
`∏` on macOS (US layout), which proves the HID side works and narrows the problem to the browser shortcut
(`chrome://extensions/shortcuts`).

## No board yet?

Map one key on a Stream Deck or macro pad to `Alt+Shift+P`. Same effect, zero firmware.
