from PIL import Image
import numpy as np,cv2,json
im=np.array(Image.open('assets/mascot/calendar-whole-character.png').convert('RGBA'))
frames=[]
for i in range(16):
 a=im[(i//4)*384:(i//4+1)*384,(i%4)*256:(i%4+1)*256]
 rgb=(a[:,:,:3]*(a[:,:,3:4]/255)+255*(1-a[:,:,3:4]/255)).astype('uint8')
 frames.append(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY).astype('float32')[:175,:240]/255)
result=[]
for i,f in enumerate(frames):
 mat=np.eye(2,3,dtype=np.float32)
 score,mat=cv2.findTransformECC(frames[0],f,mat,cv2.MOTION_TRANSLATION,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,200,1e-6))
 result.append({'dx':round(-float(mat[0,2]),3),'dy':round(-float(mat[1,2]),3),'score':round(score,4)})
print(json.dumps(result))
open('.expo-mascot-check/whole-registration.json','w').write(json.dumps(result))
