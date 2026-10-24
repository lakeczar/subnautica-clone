# Headless Blender probe for the Siltwake asset-pipeline research.
# Run: blender -b --factory-startup --python-exit-code 1 --python probe_bpy.py -- OUT_DIR [engine]
# Builds one small prop from code, bakes AO into a colour attribute, exports
# GLB (plain and Draco), renders a 4-angle line-up, and writes report.json.
import bpy, bmesh, json, math, os, sys, time

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
ENGINE = argv[1] if len(argv) > 1 else "CYCLES"
# Optional bench size: PROBE_SCALE multiplies the 768x320 line-up, PROBE_SAMPLES sets Cycles samples.
SCALE = float(os.environ.get("PROBE_SCALE", "1")); SAMPLES = int(os.environ.get("PROBE_SAMPLES", "24"))
os.makedirs(OUT, exist_ok=True)
report = {"blender": bpy.app.version_string, "engine": ENGINE, "steps": {}}
t0 = time.time()

def step(name, fn):
    s = time.time()
    try:
        r = fn()
        report["steps"][name] = {"ok": True, "s": round(time.time() - s, 3), **(r or {})}
    except Exception as e:  # report and continue
        report["steps"][name] = {"ok": False, "s": round(time.time() - s, 3), "error": repr(e)}

# Palette from src/render/palette.ts (sRGB hex) -> linear for Blender.
PAL = {"porcelain": "#f1f0dc", "seam": "#193f4c", "ochre": "#e6a139", "metal": "#527d86", "steelLight": "#9bbdb9"}
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # A sealed instrument canister: lathed body, banded seams, a grab handle and bolts.
    prof = [(0.0, 0.0), (0.42, 0.0), (0.46, 0.06), (0.46, 0.18), (0.40, 0.2), (0.40, 0.95),
            (0.46, 0.97), (0.46, 1.10), (0.30, 1.22), (0.12, 1.26), (0.0, 1.26)]
    bm = bmesh.new()
    sides = 24
    rings = []
    for r, y in prof:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides), y)) for i in range(sides)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            try: bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new("canister")
    bm.to_mesh(me); bm.free()
    body = bpy.data.objects.new("canister", me)
    bpy.context.scene.collection.objects.link(body)
    # Materials stand in for palette slots; faces get a slot by height.
    for name in PAL:
        m = bpy.data.materials.new(name); m.diffuse_color = (*lin(PAL[name]), 1); me.materials.append(m)
    for f in me.polygons:
        z = f.center.z
        f.material_index = 1 if (z < 0.2 or 0.95 < z < 1.1) else (2 if 0.55 < z < 0.62 else 0)
    bev = body.modifiers.new("bevel", "BEVEL"); bev.width = 0.012; bev.segments = 2; bev.limit_method = "ANGLE"
    body.modifiers.new("wn", "WEIGHTED_NORMAL")
    # Handle: a torus segment; bolts: small cylinders around the upper band.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.03, location=(0, 0, 1.3), rotation=(math.pi / 2, 0, 0))
    h = bpy.context.object; h.name = "handle"; h.data.materials.append(bpy.data.materials["metal"])
    for i in range(8):
        a = 2 * math.pi * i / 8
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.03, depth=0.04,
            location=(0.47 * math.cos(a), 0.47 * math.sin(a), 1.035), rotation=(0, math.pi / 2, a))
        bpy.context.object.data.materials.append(bpy.data.materials["steelLight"])
    # Join to one mesh with modifiers applied (what the bake would ingest).
    bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active = body
    for o in bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    ob = bpy.context.object
    # Flat shading per face (the game's faceted read), kept even after bevel.
    for p in ob.data.polygons: p.use_smooth = False
    # Palette colour attribute per face corner, from the material slot.
    col = ob.data.color_attributes.new("palette", "FLOAT_COLOR", "CORNER")
    for p in ob.data.polygons:
        c = ob.data.materials[p.material_index].diffuse_color
        for li in p.loop_indices: col.data[li].color = c
    # Siltwake cel class: 1 = plain lit (the shader's alpha meaning).
    cls = ob.data.attributes.new("_siltwake_class", "FLOAT", "POINT")
    for d in cls.data: d.value = 1.0
    return {"tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "verts": len(ob.data.vertices)}

def bake_ao():
    ob = bpy.data.objects["canister"]
    ao = ob.data.color_attributes.new("ao", "FLOAT_COLOR", "CORNER")
    ob.data.color_attributes.active_color = ao
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 64
    # Bake needs a node material on every slot.
    for m in ob.data.materials: m.use_nodes = True
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    vals = [d.color[0] for d in ao.data]
    # Multiply AO into the palette attribute: what the game would receive.
    pal = ob.data.color_attributes["palette"]
    for i, d in enumerate(pal.data):
        k = 0.55 + 0.45 * ao.data[i].color[0]
        d.color = (d.color[0] * k, d.color[1] * k, d.color[2] * k, 1)
    ob.data.color_attributes.active_color = pal
    ob.data.color_attributes.render_color_index = list(ob.data.color_attributes).index(pal)
    return {"ao_min": round(min(vals), 3), "ao_max": round(max(vals), 3)}

def lod():
    ob = bpy.data.objects["canister"]
    c = ob.copy(); c.data = ob.data.copy(); c.name = "canister.coarse"
    bpy.context.scene.collection.objects.link(c)
    d = c.modifiers.new("dec", "DECIMATE"); d.ratio = 0.25
    bpy.context.view_layer.objects.active = c; bpy.ops.object.modifier_apply(modifier="dec")
    c.location.x = 3.0
    return {"coarse_tris": sum(len(p.vertices) - 2 for p in c.data.polygons)}

def export():
    out = {}
    for name, draco in (("canister.glb", False), ("canister.draco.glb", True)):
        p = os.path.join(OUT, name)
        kw = dict(filepath=p, export_format="GLB", export_apply=True, export_attributes=True,
                  export_draco_mesh_compression_enable=draco)
        try: bpy.ops.export_scene.gltf(**kw, export_vertex_color="ACTIVE")
        except TypeError: bpy.ops.export_scene.gltf(**kw)
        out[name] = os.path.getsize(p)
    return out

def lineup():
    # Four copies at 0/90/180/270 degrees under one camera: a turntable in one frame.
    ob = bpy.data.objects["canister"]
    bpy.data.objects["canister.coarse"].hide_render = True
    for i in range(4):
        c = ob if i == 0 else ob.copy()
        if i: bpy.context.scene.collection.objects.link(c)
        c.location = (i * 1.25 - 1.875, 0, 0); c.rotation_euler = (0, 0, i * math.pi / 2)
    mat = bpy.data.materials.new("vc"); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
    a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "palette"
    nt.links.new(a.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.8
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(mat)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -7.6, 2.2); cam.rotation_euler = (math.radians(80), 0, 0); cam.data.lens = 50
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(-30)); sun.data.energy = 3
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.15, 0.18, 1)
    sc = bpy.context.scene; sc.world = w; sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = int(768 * SCALE), int(320 * SCALE)
    if ENGINE.startswith("CYCLES"):
        sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = False
        sc.cycles.device = "CPU"
        if ENGINE in ("CYCLES_CUDA", "CYCLES_OPTIX"):
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = ENGINE.split("_")[1]
            prefs.get_devices()
            used = [d.name for d in prefs.devices if d.type == prefs.compute_device_type]
            for d in prefs.devices: d.use = d.type == prefs.compute_device_type
            if not used: raise RuntimeError("no %s device" % prefs.compute_device_type)
            sc.cycles.device = "GPU"; report["cycles_devices"] = used
    elif ENGINE == "WORKBENCH":
        sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "VERTEX"
    else:
        sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
    sc.render.filepath = os.path.join(OUT, f"lineup-{ENGINE.lower()}.png")
    bpy.ops.render.render(write_still=True)
    return {"image": sc.render.filepath, "render_engine": sc.render.engine}

step("build", build)
if ENGINE.startswith("CYCLES"):
    step("bake_ao", bake_ao)
step("lod", lod)
step("export", export)
step("save_blend", lambda: (bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "canister.blend")), {})[1])
step("lineup", lineup)
report["total_s"] = round(time.time() - t0, 3)
with open(os.path.join(OUT, f"report-{ENGINE.lower()}.json"), "w") as f: json.dump(report, f, indent=1)
print(json.dumps(report, indent=1))
