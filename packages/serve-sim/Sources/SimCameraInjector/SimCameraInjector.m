#import <UIKit/UIKit.h>
#include <unistd.h>

#import "SimCamFakes.h"
#import "SimCamFrameSource.h"
#import "SimCamLog.h"
#import "SimCamSwizzles.h"

// A late-loaded dylib misses setSession: calls made before injection. Adopt
// existing preview layers without rebuilding or restarting the app's sessions.
static NSUInteger SimCamAdoptPreviewLayers(CALayer *layer) {
    NSUInteger count = 0;
    if ([layer isKindOfClass:AVCaptureVideoPreviewLayer.class]) {
        AVCaptureVideoPreviewLayer *preview = (AVCaptureVideoPreviewLayer *)layer;
        if (preview.session) {
            SimCamSetPosition(preview, SimCamPositionOf(preview.session));
            [[SimCamRegistry shared] addPreviewLayer:preview];
            count++;
        }
    }
    for (CALayer *child in [layer.sublayers copy]) {
        count += SimCamAdoptPreviewLayers(child);
    }
    return count;
}

static void SimCamAdoptExistingPreviews(void) {
    // Do not synchronously dispatch from a dylib initializer: LLDB may have
    // paused the main thread while loading us on another thread.
    dispatch_async(dispatch_get_main_queue(), ^{
        NSMutableSet<UIWindow *> *windows = [NSMutableSet set];
        for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
            if ([scene isKindOfClass:UIWindowScene.class]) {
                [windows addObjectsFromArray:((UIWindowScene *)scene).windows];
            }
        }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        [windows addObjectsFromArray:UIApplication.sharedApplication.windows];
#pragma clang diagnostic pop
        NSUInteger count = 0;
        for (UIWindow *window in windows) {
            count += SimCamAdoptPreviewLayers(window.layer);
        }
        if (count) SimCamMarkCameraInUse();
        simcam_log(@"adopted %lu existing camera preview layers", (unsigned long)count);
    });
}

__attribute__((constructor))
static void SimCamInit(void) {
    @autoreleasepool {
        simcam_log(@"loaded into pid %d", getpid());
        SimCamReadMirrorModeFromEnv();
        SimCamFrameSourceOpenShmIfRequested();
        if (!SimCamFrameSourceIsShmAttached()) SimCamFrameSourceLoadImage();
        SimCamInstallSwizzles();
        SimCamAdoptExistingPreviews();
        simcam_log(@"swizzles installed");
    }
}
