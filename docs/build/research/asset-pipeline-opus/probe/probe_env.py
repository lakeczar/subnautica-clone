# Which GPU paths does this Blender see? Run:
#   blender -b --factory-startup --python-exit-code 1 --python probe_env.py -- OUT_JSON
# Renders one 64x64 EEVEE frame (to create the GPU context), then records the
# OpenGL/Vulkan backend, vendor and renderer, and every Cycles compute device.
import bpy, json, sys, time

out = sys.argv[sys.argv.index("--") + 1]
r = {"blender": bpy.app.version_string, "background": bpy.app.background}
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x = sc.render.resolution_y = 64
sc.render.filepath = out + ".png"
t = time.time()
try:
    bpy.ops.render.render(write_still=True)
    r["eevee_frame"] = {"ok": True, "s": round(time.time() - t, 2)}
except Exception as e:
    r["eevee_frame"] = {"ok": False, "error": repr(e)}
try:
    import gpu
    p = gpu.platform
    r["gpu"] = {"backend": p.backend_type_get(), "vendor": p.vendor_get(), "renderer": p.renderer_get(),
                "version": p.version_get(), "device_type": p.device_type_get()}
except Exception as e:
    r["gpu"] = {"error": repr(e)}
prefs = bpy.context.preferences.addons["cycles"].preferences
r["cycles"] = {}
for kind in ("CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        r["cycles"][kind] = [d.name for d in prefs.devices if d.type == kind]
    except Exception as e:
        r["cycles"][kind] = "unavailable: " + repr(e)[:120]
with open(out, "w") as f:
    json.dump(r, f, indent=1)
print(json.dumps(r, indent=1))
