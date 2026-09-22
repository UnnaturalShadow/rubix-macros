using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// .NET Framework helper; no console window, no shell, no third-party runtime.
internal static class CubeInput
{
    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT { public uint type; public InputUnion data; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT { public int x, y; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT { public uint message; public ushort low, high; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);

    private static INPUT Key(ushort vk, bool up, bool forceExtended = false)
    {
        bool extended = forceExtended || vk == 0x5b || vk == 0x5c || vk == 0x5d || vk == 0x6f ||
            vk == 0x90 || vk == 0xa3 || vk == 0xa5 || (vk >= 0x21 && vk <= 0x2e) || (vk >= 0xad && vk <= 0xb3);
        return new INPUT { type = 1, data = new InputUnion {
            keyboard = new KEYBDINPUT { vk = vk, flags = (up ? 2u : 0u) | (extended ? 1u : 0u) }
        }};
    }

    [STAThread]
    private static int Main(string[] args)
    {
        // Allows build/smoke checks without injecting keyboard events.
        if (args.Length == 1 && args[0] == "--self-test")
            return Marshal.SizeOf(typeof(INPUT)) == (IntPtr.Size == 8 ? 40 : 28) &&
                Key(13, false).data.keyboard.flags == 0 && Key(13, false, true).data.keyboard.flags == 1 &&
                Key(13, true, true).data.keyboard.flags == 3 && Key(0xa3, false).data.keyboard.flags == 1 &&
                Key(0xa2, false).data.keyboard.flags == 0 && Key(0x6f, false).data.keyboard.flags == 1 ? 0 : 3;
        if (args.Length < 1 || args.Length > 5) return 2;
        var keys = new List<ushort>();
        var extendedKeys = new List<bool>();
        foreach (string arg in args) {
            // Only keypad Enter needs an explicit extended override. Existing numeric argv remains valid.
            bool extended = arg == "13:e";
            ushort key;
            if (!ushort.TryParse(extended ? "13" : arg, out key) || key < 1 || key > 254) return 2;
            keys.Add(key);
            extendedKeys.Add(extended);
        }
        var events = new List<INPUT>();
        for (int i = 0; i < keys.Count; i++) events.Add(Key(keys[i], false, extendedKeys[i]));
        for (int i = keys.Count - 1; i >= 0; i--) events.Add(Key(keys[i], true, extendedKeys[i]));
        uint sent = SendInput((uint)events.Count, events.ToArray(), Marshal.SizeOf(typeof(INPUT)));
        if (sent != events.Count) {
            // Release injected modifiers even if Windows rejected part of the batch.
            var release = new List<INPUT>();
            for (int i = keys.Count - 1; i >= 0; i--) release.Add(Key(keys[i], true, extendedKeys[i]));
            SendInput((uint)release.Count, release.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            return 1;
        }
        return 0;
    }
}
