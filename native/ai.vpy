"""Optional mpv VapourSynth filter. The host passes a validated JSON configuration."""
import json, os, sys
from pathlib import Path
from fractions import Fraction
import vapoursynth as vs
cfg=json.loads(user_data)
runtime=Path(cfg['runtime'])
sys.path.insert(0,str(runtime/'Lib/site-packages'))
backend=cfg.get('backend','vulkan')
plugins=runtime/'vs-plugins'
names={'vulkan':('ncnn','vsncnn.dll'),'openvino':('ov','vsov.dll'),'tensorrt':('trt','vstrt.dll')}
namespace,dll=names[backend]
if not hasattr(vs.core,namespace):vs.core.std.LoadPlugin(str(plugins/dll))
from vsmlrt import Backend,RealESRGAN,RealESRGANModel,RIFE,RIFEModel
engine={'vulkan':lambda:Backend.NCNN_VK(fp16=True),'openvino':lambda:Backend.OV_GPU(fp16=True),'tensorrt':lambda:Backend.TRT(fp16=True)}[backend]()
clip=video_in
fps=clip.fps if clip.fps.numerator else Fraction(str(container_fps or 25)).limit_denominator(1001)
if not clip.fps.numerator:clip=vs.core.std.AssumeFPS(clip,fpsnum=fps.numerator,fpsden=fps.denominator)
# mpv's dynamic video_in cannot be requested during script initialization.
# Use its container dimensions as a fallback; resize prefers existing frame props.
matrix=1 if clip.width>=1280 or clip.height>=720 else 6
clip=vs.core.resize.Bicubic(clip,format=vs.RGBS,matrix_in=matrix)
mode=cfg.get('interpolation','off')
output_fps=fps
if mode!='off':
    target=Fraction(2) if mode=='rife2x' else min(Fraction(60,1)/fps,Fraction(2))
    if target>1:
        # RIFE's network requires multiples of 32. Pad and crop, never stretch.
        pad_w=(-clip.width)%32
        pad_h=(-clip.height)%32
        if pad_w or pad_h:clip=vs.core.std.AddBorders(clip,right=pad_w,bottom=pad_h)
        clip=RIFE(clip,multi=target,model=RIFEModel.v4_4,backend=engine,video_player=True)
        if pad_w or pad_h:clip=vs.core.std.Crop(clip,right=pad_w,bottom=pad_h)
        output_fps=fps*target
if cfg.get('profile')=='realesrgan':
    clip=RealESRGAN(clip,model=RealESRGANModel.animevideo_xsx2,backend=engine,tilesize=128)
clip=vs.core.resize.Bicubic(clip,format=vs.YUV420P8,matrix=matrix)
clip=vs.core.std.SetFrameProps(clip,_DurationNum=output_fps.denominator,_DurationDen=output_fps.numerator)
clip.set_output()
