# Blender with its UI on a (virtual) display: record the GPU, save a window
# screenshot and quit. Run: blender --factory-startup --python probe_gui.py -- OUT_PREFIX
import bpy, json, sys

out = sys.argv[sys.argv.index("--") + 1]

def shoot():
    r = {"blender": bpy.app.version_string, "background": bpy.app.background}
    try:
        import gpu
        p = gpu.platform
        r["gpu"] = {"backend": p.backend_type_get(), "vendor": p.vendor_get(), "renderer": p.renderer_get(),
                    "version": p.version_get(), "device_type": p.device_type_get()}
    except Exception as e:
        r["gpu"] = {"error": repr(e)}
    try:
        win = bpy.context.window_manager.windows[0]
        with bpy.context.temp_override(window=win, screen=win.screen):
            bpy.ops.screen.screenshot(filepath=out + ".png")
        r["screenshot"] = out + ".png"
    except Exception as e:
        r["screenshot_error"] = repr(e)
    with open(out + ".json", "w") as f:
        json.dump(r, f, indent=1)
    print(json.dumps(r, indent=1))
    bpy.ops.wm.quit_blender()

bpy.app.timers.register(shoot, first_interval=6.0)
