from PIL import Image
import json,math
j=json.load(open('.expo-mascot-check/poses.json')); r=j['rig']; im=Image.open('assets/mascot/calendar-peek-parts.png').convert('RGBA')
points=[(x,y) for y in range(865,1175) for x in range(405,635) if im.getpixel((x,y))[3]>=32]
maxx=0
for p in j['poses']:
 if not p['openHand']:continue
 a=math.radians(p['angle']); c,s=math.cos(a),math.sin(a)
 w=math.radians(p['wristAngle']); wc,ws=math.cos(w),math.sin(w)
 for x,y in points:
  if y<1044:
   dx,dy=(x-517)*p['palmScaleX'],y-1036
   x,y=517+wc*dx-ws*dy,1036+ws*dx+wc*dy
  dx,dy=(x-468)*.88,(y-1122)*.88
  px,py=570+c*dx-s*dy,625+s*dx+c*dy
  maxx=max(maxx,px)
  assert 160<=px<=650 and 0<=py<=710,(p,px,py)
print('Wrist-turn clearance passed across the full loop. Right clearance: %.2f source pixels.'%(650-maxx))
