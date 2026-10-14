-- Fullscreen controls are composited by mpv, on the same surface as the video.
-- Showing/fading them never resizes the HWND or places WebView over native video.
local mp = require 'mp'
local overlay = mp.create_osd_overlay('ass-events')
overlay.z = 20
local enabled, opacity, target, last_input = false, 0, 0, 0
local menu, drag, pressed, keyboard, focus = false, nil, nil, false, 1
local click_timer
local original_cursor='1000'
local token, rendered, render_error = '', false, ''
local context = {episode=1,total=1,duration=0,origin=0,reduced=false}
local speeds = {0.5,0.75,1,1.25,1.5,1.75,2,2.5,3}
local mouse = {x=-100,y=-100,hover=false}
local buttons, regions = {}, {}
local w,h,scale = 1280,720,1
local frame, idle, draw
local animation_from, animation_start = 0,0
local function emit(name,value) mp.commandv('script-message','hongguo',name,tostring(value or '')) end
local function clamp(v,a,b) return math.max(a,math.min(b,v)) end
local function inside(r,x,y) return r and x>=r.x and x<=r.x+r.w and y>=r.y and y<=r.y+r.h end
local function dimensions()
 local pw,ph=mp.get_osd_size()
 if pw and ph and pw>0 and ph>0 then scale=720/ph;w=pw*scale;h=720 end
end
local function pointer()
 local p=mp.get_property_native('mouse-pos')
 if p then mouse={x=(p.x or -100)*scale,y=(p.y or -100)*scale,hover=p.hover==true} end
end
local function time(v)
 v=math.floor(math.max(0,v or 0))
 if v>=3600 then return string.format('%d:%02d:%02d',math.floor(v/3600),math.floor(v/60)%60,v%60) end
 return string.format('%d:%02d',math.floor(v/60),v%60)
end
local function publish()
 mp.set_property_native('user-data/hongguo/fullscreen-controls',{enabled=enabled,opacity=opacity,menu=menu,drag=drag or '',width=w,height=h,token=token,rendered=rendered,error=render_error})
end
local function animate(value)
 if target==value then return end
 animation_from=opacity;animation_start=mp.get_time();target=value
 if context.reduced then opacity=value;draw();return end
 frame:resume()
end
local function reveal()
 if not enabled then return end
 last_input=mp.get_time();animate(1);idle:resume()
end
local function hit()
 if opacity<0.1 then return nil end
 for i=#regions,1,-1 do if inside(regions[i],mouse.x,mouse.y) then return regions[i] end end
end
local function seek_at(x)
 return clamp((x-30)/(w-60),0,1)*context.duration
end
local function volume_at(x)
 mp.set_property_number('volume',clamp((x-205)/85,0,1)*100)
end
local function activate(id)
 if id=='pause' then mp.commandv('cycle','pause')
 elseif id=='previous' and context.episode>1 then emit('previous')
 elseif id=='next' and context.episode<context.total then emit('next')
 elseif id=='mute' then local v=mp.get_property_number('volume',60);mp.set_property_number('volume',v>0 and 0 or 60)
 elseif id=='speed' then menu=not menu
 elseif id=='pip' then emit('pip')
 elseif id=='fullscreen' then emit('fullscreen')
 elseif id:sub(1,6)=='speed:' then menu=false;emit('select-speed',tonumber(id:sub(7))) end
 reveal();draw()
end

draw=function()
 if not enabled or opacity<=0 then overlay:remove();publish();return end
 dimensions();pointer();regions={};buttons={}
 local data={}
 local shift=18*(1-opacity)
 local function alpha(a) return string.format('%02X',math.floor(255*(1-opacity*(a or 1))+.5)) end
 local function shape(path,color,a)
  data[#data+1]=string.format('{\\an7\\pos(0,%.2f)\\bord0\\shad0\\1c&H%s&\\alpha&H%s&\\p1}%s{\\p0}',shift,color or 'F5F5F5',alpha(a),path)
 end
 local function box(x,y,bw,bh,color,a)
  shape(string.format('m %.2f %.2f l %.2f %.2f %.2f %.2f %.2f %.2f',x,y,x+bw,y,x+bw,y+bh,x,y+bh),color,a)
 end
 local function text(x,y,value,size,color,align)
  data[#data+1]=string.format('{\\an%d\\pos(%.2f,%.2f)\\fnMicrosoft YaHei UI\\fs%d\\bord0\\shad0\\1c&H%s&\\alpha&H%s&}%s',align or 5,x,y+shift,size or 14,color or 'F5F5F5',alpha(),value)
 end
 local function circle(x,y,r,color)
  local k=r*.5523
  shape(string.format('m %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f',x-r,y,x-r,y-k,x-k,y-r,x,y-r,x+k,y-r,x+r,y-k,x+r,y,x+r,y+k,x+k,y+r,x,y+r,x-k,y+r,x-r,y+k,x-r,y),color)
 end
 local function region(id,x,y,bw,bh,label,disabled)
  local r={id=id,x=x,y=y+shift,w=bw,h=bh,label=label,disabled=disabled};regions[#regions+1]=r;return r
 end
 local function button(id,x,label,disabled)
  local r=region(id,x-18,661,36,36,label,disabled);buttons[#buttons+1]=r
  local hover=(mouse.hover and inside(r,mouse.x,mouse.y)) or (keyboard and #buttons==focus)
  if hover and not disabled then box(x-18,661,36,36,'FFFFFF',.12) end
  return disabled and '62626A' or (hover and '8071FF' or 'F5F5F5')
 end
 -- Soft scrim rather than an opaque strip. It fades with the controls.
 for i=0,35 do box(0,h-155+i*5,w,5,'090909',.82*(i/35)^1.5) end
 local position=clamp(context.origin+mp.get_property_number('time-pos',0),0,context.duration)
 if drag=='seek' then position=seek_at(mouse.x) end
 text(30,617,time(position)..' / '..time(context.duration),12,'C8C8CF',4)
 text(w-30,617,'第 '..context.episode..' 集  ·  Esc 退出全屏',12,'C8C8CF',6)
 local progress=context.duration>0 and position/context.duration or 0
 local seek_region=region('seek',30,630,w-60,24,'拖动进度')
 local seek_hover=drag=='seek' or (mouse.hover and inside(seek_region,mouse.x,mouse.y))
 box(30,640,w-60,seek_hover and 4 or 3,'FFFFFF',.25)
 box(30,640,(w-60)*progress,seek_hover and 4 or 3,'6051FB')
 if seek_hover then circle(30+(w-60)*progress,642,5,'6051FB');text(clamp(mouse.x,65,w-65),610,time(seek_at(mouse.x)),13) end
 local color=button('pause',44,mp.get_property_bool('pause') and '播放 · 空格' or '暂停 · 空格')
 if mp.get_property_bool('pause') then shape('m 39 669 l 39 689 54 679',color)
 else box(36,669,5,20,color);box(47,669,5,20,color) end
 color=button('previous',90,'上一集',context.episode<=1);box(81,670,2,18,color);shape('m 95 670 l 95 688 83 679',color)
 color=button('next',136,'下一集',context.episode>=context.total);box(143,670,2,18,color);shape('m 131 670 l 131 688 143 679',color)
 color=button('mute',182,'静音 / 恢复音量');shape('m 172 675 l 178 675 185 669 185 689 178 683 172 683',color)
 if mp.get_property_number('volume',60)>0 then box(190,673,2,12,color) else text(193,679,'×',17,color) end
 local volume=mp.get_property_number('volume',60)
 region('volume',205,663,85,32,'音量');box(205,678,85,3,'FFFFFF',.25);box(205,678,85*volume/100,3,'F5F5F5');circle(205+85*volume/100,679.5,4,'F5F5F5')
 text(310,679,tostring(math.floor(volume))..'%',11,'C8C8CF')
 color=button('speed',w-168,'播放倍速');text(w-168,679,string.format('%g×',mp.get_property_number('speed',1)),14,color)
 color=button('pip',w-104,'画中画');box(w-115,671,22,2,color);box(w-115,671,2,16,color);box(w-115,685,22,2,color);box(w-95,671,2,16,color);box(w-104,678,8,6,color)
 color=button('fullscreen',w-44,'退出全屏 · F / Esc')
 -- Four mirrored inward corners, matching the windowed Minimize icon.
 local cx,cy=w-44,679
 box(cx-11,cy-4,9,2,color);box(cx-4,cy-11,2,9,color)
 box(cx+2,cy-4,9,2,color);box(cx+2,cy-11,2,9,color)
 box(cx-11,cy+2,9,2,color);box(cx-4,cy+2,2,9,color)
 box(cx+2,cy+2,9,2,color);box(cx+2,cy+2,2,9,color)
 if menu then
  local left=w-30-#speeds*52
  box(left-10,552,#speeds*52+20,42,'24242B',.98)
  for i,speed in ipairs(speeds) do
   local x=left+(i-1)*52
   local r=region('speed:'..speed,x,557,48,32,speed..' 倍速')
   buttons[#buttons+1]=r
   local selected=math.abs(mp.get_property_number('speed',1)-speed)<.01
   if selected or inside(r,mouse.x,mouse.y) or (keyboard and #buttons==focus) then box(x,557,48,32,selected and '6051FB' or '44444C',selected and .3 or .9) end
   text(x+24,573,string.format('%g×',speed),13,selected and '8071FF' or 'F5F5F5')
  end
 end
 local hovered=keyboard and buttons[focus] or (mouse.hover and hit())
 if hovered and hovered.label and hovered.id~='seek' and hovered.id~='volume' and not menu then
  text(clamp(hovered.x+hovered.w/2,90,w-90),654,hovered.label,11,'DDDDDD')
 end
 overlay.res_x=w;overlay.res_y=h;overlay.data=table.concat(data,'\n')
 local result,err=overlay:update()
 rendered=result~=nil;render_error=err or '';publish()
end

frame=mp.add_periodic_timer(1/60,function()
 local t=clamp((mp.get_time()-animation_start)/.24,0,1)
 local eased=1-(1-t)^3
 opacity=animation_from+(target-animation_from)*eased
 if t>=1 then opacity=target;frame:kill() end
 draw()
end);frame:kill()
idle=mp.add_periodic_timer(.1,function()
 if not enabled then idle:kill();return end
 pointer()
 local in_controls=mouse.hover and mouse.y>h-125 and opacity>.1
 mp.set_property('cursor-autohide',(in_controls or menu or drag) and 'no' or '2500')
 if not menu and not drag and not keyboard and not in_controls and mp.get_time()-last_input>2.5 then animate(0);idle:kill() end
end);idle:kill()
local function move()
 if not enabled then return end
 dimensions();pointer();keyboard=false
 if drag=='volume' then volume_at(mouse.x) end
 reveal();draw()
end
local function click(event)
 if not enabled then return end
 pointer();keyboard=false
 if event.event=='down' or event.event=='press' then
  local r=hit();pressed=r and r.id or 'video'
  if menu and (not r or (r.id~='speed' and r.id:sub(1,6)~='speed:')) then menu=false;pressed=nil
  elseif r and r.disabled then pressed=nil
  elseif r and r.id=='seek' then drag='seek'
  elseif r and r.id=='volume' then drag='volume';volume_at(mouse.x) end
 end
 if event.event=='up' or event.event=='press' then
  if drag=='seek' then emit('seek-absolute',seek_at(mouse.x))
  elseif drag=='volume' then volume_at(mouse.x)
  elseif pressed=='video' then
   if click_timer then click_timer:kill() end
   click_timer=mp.add_timeout(.25,function()click_timer=nil;mp.commandv('cycle','pause')end)
  elseif pressed then local r=hit();if r and r.id==pressed then activate(pressed) end end
  drag=nil;pressed=nil
 end
 reveal();draw()
end
local function key_focus(direction)
 local first=not keyboard;keyboard=true;reveal();draw()
 if first then focus=direction>0 and 1 or #buttons else focus=((focus-1+direction)%math.max(#buttons,1))+1 end
 draw()
end
mp.register_script_message('fullscreen-focus',function(direction)if enabled then key_focus(tonumber(direction) or 1)end end)
mp.register_script_message('fullscreen-activate',function()if enabled and keyboard and buttons[focus] then activate(buttons[focus].id)end end)
local function escape()
 if menu then menu=false;keyboard=false;reveal();draw()else emit('escape')end
end
mp.register_script_message('fullscreen-escape',function()if enabled then escape()end end)
local bindings={'fs-click','fs-double','fs-move','fs-leave','fs-tab','fs-backtab','fs-enter','fs-escape'}
mp.register_script_message('fullscreen-ui',function(on,episode,total,duration,origin,reduced,request_token)
 local was_enabled=enabled;enabled=on=='true'
 token=request_token or '';render_error=''
 context={episode=tonumber(episode) or 1,total=tonumber(total) or 1,duration=tonumber(duration) or 0,origin=tonumber(origin) or 0,reduced=reduced=='true'}
 if enabled and not was_enabled then
  menu=false;keyboard=false;drag=nil;opacity=0;target=0;rendered=false
  mp.add_forced_key_binding('MBTN_LEFT','fs-click',click,{complex=true})
  mp.add_forced_key_binding('MBTN_LEFT_DBL','fs-double',function()if click_timer then click_timer:kill();click_timer=nil end;pressed=nil;pointer();if not hit() then emit('fullscreen') end end)
  mp.add_forced_key_binding('MOUSE_MOVE','fs-move',move)
  mp.add_forced_key_binding('MOUSE_LEAVE','fs-leave',function()mouse.hover=false;if drag then drag=nil;pressed=nil end end)
  mp.add_forced_key_binding('TAB','fs-tab',function()key_focus(1)end)
  mp.add_forced_key_binding('Shift+TAB','fs-backtab',function()key_focus(-1)end)
  mp.add_forced_key_binding('ENTER','fs-enter',function()if keyboard and buttons[focus] then activate(buttons[focus].id)end end)
  mp.add_forced_key_binding('ESC','fs-escape',escape)
  original_cursor=mp.get_property('cursor-autohide','1000')
  mp.set_property('cursor-autohide','2500');reveal()
 elseif not enabled then
  for _,binding in ipairs(bindings)do mp.remove_key_binding(binding)end
  if was_enabled then mp.set_property('cursor-autohide',original_cursor)end
  if click_timer then click_timer:kill();click_timer=nil end
  frame:kill();idle:kill();menu=false;drag=nil;opacity=0;target=0
 end
 draw()
end)
for _,property in ipairs({'time-pos','duration','pause','speed','volume','osd-dimensions'})do
 mp.observe_property(property,'native',function()if enabled and opacity>0 then draw()end end)
end
mp.observe_property('focused','bool',function(_,focused)if not focused then drag=nil;pressed=nil;keyboard=false;menu=false end end)
mp.register_event('start-file',function()drag=nil;pressed=nil;menu=false end)
mp.register_event('shutdown',function()overlay:remove()end)
