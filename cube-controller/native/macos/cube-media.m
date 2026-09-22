#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/ev_keymap.h>

// Post actual system media key down/up events, independent of the foreground app.
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        NSString *action = [NSString stringWithUTF8String:argv[1]];
        NSDictionary *keys = @{
            @"playPause": @(NX_KEYTYPE_PLAY), @"nextTrack": @(NX_KEYTYPE_NEXT),
            @"previousTrack": @(NX_KEYTYPE_PREVIOUS), @"volumeUp": @(NX_KEYTYPE_SOUND_UP),
            @"volumeDown": @(NX_KEYTYPE_SOUND_DOWN), @"mute": @(NX_KEYTYPE_MUTE)
        };
        NSNumber *key = keys[action];
        if (!key) return 2;
        if (!AXIsProcessTrusted()) {
            fprintf(stderr, "Enable Accessibility permission for Cube Controller (Electron during development).\n");
            return 1;
        }
        for (int down = 1; down >= 0; down--) {
            NSInteger data = ([key integerValue] << 16) | ((down ? 0xA : 0xB) << 8);
            NSEvent *event = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                location:NSZeroPoint modifierFlags:(down ? 0xA00 : 0xB00)
                timestamp:0 windowNumber:0 context:nil subtype:8 data1:data data2:-1];
            CGEventRef cg = [event CGEvent];
            if (!cg) return 1;
            CGEventPost(kCGHIDEventTap, cg);
        }
    }
    return 0;
}
