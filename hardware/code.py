"""PromptButton — one physical key that sends Alt+Shift+P.

CircuitPython, works on any board with native USB HID (Raspberry Pi Pico / Pico W,
ESP32-S2/S3, RP2040 macropads). The computer sees an ordinary USB keyboard, so no
driver or pairing is needed; the browser extension and the web playground both
listen for the same chord.

Setup:
  1. Install CircuitPython on the board (circuitpython.org/downloads).
  2. Copy the `adafruit_hid` folder from the CircuitPython library bundle to CIRCUITPY/lib/.
  3. Copy this file to CIRCUITPY/code.py.
  4. Wire a momentary switch between BUTTON_PIN and GND (internal pull-up is used).
"""

import time

import board
import digitalio
import usb_hid
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

# Pico: board.GP15. ESP32-S3 dev boards: e.g. board.IO4. Change to match your wiring.
BUTTON_PIN = board.GP15
# Optional on-board LED to confirm the press (board.LED on the Pico; None to disable).
LED_PIN = getattr(board, "LED", None)

DEBOUNCE_S = 0.03
REPEAT_GUARD_S = 0.4  # ignore bounces / double taps for this long after a send

keyboard = Keyboard(usb_hid.devices)

button = digitalio.DigitalInOut(BUTTON_PIN)
button.switch_to_input(pull=digitalio.Pull.UP)

led = None
if LED_PIN is not None:
    led = digitalio.DigitalInOut(LED_PIN)
    led.switch_to_output(value=False)


def send_chord():
    # Hold Alt+Shift, tap P, release everything. Matches the extension's chrome.commands key.
    keyboard.press(Keycode.ALT, Keycode.SHIFT, Keycode.P)
    time.sleep(0.02)
    keyboard.release_all()


was_down = False
last_sent = 0.0

while True:
    is_down = not button.value  # pull-up: pressed reads LOW
    if is_down and not was_down:
        time.sleep(DEBOUNCE_S)
        if not button.value and time.monotonic() - last_sent > REPEAT_GUARD_S:
            if led:
                led.value = True
            send_chord()
            last_sent = time.monotonic()
            if led:
                time.sleep(0.08)
                led.value = False
    was_down = is_down
    time.sleep(0.005)
