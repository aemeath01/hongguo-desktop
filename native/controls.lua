local mp = require 'mp'
local options = {hold_speed=2, seek_seconds=5, adaptive=true}
local active, timer, original, held
local function restore()
  if timer then timer:kill(); timer=nil end
  if held and original then mp.set_property_number('speed',original) end
  active=nil; held=false; original=nil
end
local function horizontal(key,direction,event)
  if event.event=='down' then
    if active then return end
    active=key; original=mp.get_property_number('speed',1); held=false
    timer=mp.add_timeout(0.3,function()
      held=true; mp.set_property_number('speed',options.hold_speed)
      mp.osd_message(string.format('长按 %.2g 倍速',options.hold_speed),30)
    end)
  elseif event.event=='up' and active==key then
    local was_held=held; restore()
    if was_held then mp.osd_message('恢复播放速度',0.7) else mp.commandv('script-message','hongguo','seek',direction*options.seek_seconds) end
  elseif event.event=='press' then mp.commandv('script-message','hongguo','seek',direction*options.seek_seconds) end
end
for key,dir in pairs({LEFT=-1,RIGHT=1,a=-1,d=1,A=-1,D=1}) do
  mp.add_forced_key_binding(key,'hg-'..key,function(e) horizontal(key,dir,e) end,{complex=true})
end
for key,dir in pairs({UP=1,DOWN=-1,w=1,s=-1,W=1,S=-1}) do
 mp.add_forced_key_binding(key,'hg-'..key,function() mp.set_property_number('volume',math.max(0,math.min(100,mp.get_property_number('volume',60)+dir*5))); mp.osd_message('音量 '..math.floor(mp.get_property_number('volume'))..'%',0.7) end,{repeatable=true})
end
mp.add_forced_key_binding('SPACE','hg-pause',function()mp.commandv('cycle','pause')end)
mp.add_forced_key_binding('MBTN_LEFT','hg-click',function()mp.commandv('cycle','pause')end)
local function action(name) mp.commandv('script-message','hongguo',name) end
mp.add_forced_key_binding('MBTN_LEFT_DBL','hg-fullscreen',function()action('fullscreen')end)
mp.add_forced_key_binding('f','hg-f',function()action('fullscreen')end)
mp.add_forced_key_binding('ESC','hg-escape',function()action('escape')end)
mp.register_script_message('restore-speed',restore)
mp.register_script_message('set-speed',function(speed)
  -- Menu choices and episode transitions also cancel a held native key.
  -- Its eventual key-up must not restore the previous episode's speed.
  restore()
  mp.set_property_number('speed',tonumber(speed) or 1)
end)
mp.register_script_message('preferences',function(speed,seek,adaptive)
  options.hold_speed=tonumber(speed) or 2;options.seek_seconds=tonumber(seek) or 5; options.adaptive=adaptive=='true'
end)
mp.observe_property('focused','bool',function(_,focused)if focused==false then restore()end end)
mp.register_event('start-file',restore)
mp.register_event('end-file',restore)
-- Count only sustained playback, excluding pause, buffering and seek warm-up.
local last_drop, strikes, warmup=0,0,0
mp.register_event('playback-restart',function() warmup=mp.get_time()+5; strikes=0; last_drop=mp.get_property_number('frame-drop-count',0) end)
mp.add_periodic_timer(3,function()
  local drops=mp.get_property_number('frame-drop-count',0)+mp.get_property_number('decoder-frame-drop-count',0)
  local delta=math.max(0,drops-last_drop);last_drop=drops
  if not options.adaptive or mp.get_time()<warmup or mp.get_property_bool('pause') or mp.get_property_bool('paused-for-cache') then strikes=0;return end
  if delta>=6 then strikes=strikes+1 else strikes=0 end
  if strikes>=3 then
    strikes=0
    local shaders=mp.get_property_native('glsl-shaders',{})
    local filters=mp.get_property_native('vf',{})
    if #shaders>0 or #filters>0 then action('performance-fallback') end
  end
end)
