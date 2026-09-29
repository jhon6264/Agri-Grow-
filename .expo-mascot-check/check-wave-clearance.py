from PIL import Image
import math
im=Image.open('assets/mascot/calendar-peek-parts.png').convert('RGBA')
points=[(x,y) for y in range(865,1175) for x in range(405,635) if im.getpixel((x,y))[3]>=32]
worst=(-1,None)
for step in range(281):
    angle=-26-step/10
    c,s=math.cos(math.radians(angle)),math.sin(math.radians(angle))
    for x,y in points:
        dx,dy=(x-468)*.88,(y-1122)*.88
        px,py=570+c*dx-s*dy,625+s*dx+c*dy
        if px>worst[0]: worst=(px,angle)
        assert 160<=px<=650 and 0<=py<=710,(angle,px,py)
print('All visible waving-arm pixels fit the viewport across -26 to -54 degrees. Minimum right clearance: %.2f source pixels.'%(650-worst[0]))
