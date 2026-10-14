"""Small synthetic capability probe; not a real-time video benchmark."""
import sys,json,time
from pathlib import Path
root=Path(sys.argv[1]).resolve()
import vapoursynth as vs
vs.core.std.LoadPlugin(str(root/'vs-plugins/vsncnn.dll'))
import vsmlrt
clip=vs.core.std.BlankClip(width=128,height=128,length=4,fpsnum=25,format=vs.RGBS,color=[.1,.2,.3])
results={}
for name,build in [('rife',lambda:vsmlrt.RIFE(clip,model=vsmlrt.RIFEModel.v4_4,backend=vsmlrt.Backend.NCNN_VK(fp16=True),video_player=True)),('realesrgan',lambda:vsmlrt.RealESRGAN(clip,backend=vsmlrt.Backend.NCNN_VK(fp16=True)))]:
    t=time.perf_counter()
    try:
        enhanced=build();enhanced.get_frame(1)
        results[name]={'runs':True,'width':enhanced.width,'height':enhanced.height,'fps':str(enhanced.fps),'seconds':round(time.perf_counter()-t,3)}
    except Exception as e:results[name]={'runs':False,'error':str(e)[:400]}
print(json.dumps(results))
