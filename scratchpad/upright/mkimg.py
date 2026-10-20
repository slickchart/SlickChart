from PIL import Image, ImageDraw
import sys
# raw sensor frame: landscape 400x300; "top of the scene" (phone's top when held portrait) is the raw LEFT edge
def raw():
    im=Image.new('RGB',(400,300),(255,255,255)); d=ImageDraw.Draw(im); d.rectangle([0,0,60,299],fill=(255,0,0)); return im
for o in [1,3,6,8]:
    im=raw(); ex=Image.Exif(); ex[0x0112]=o
    im.save(f'o{o}.jpg',exif=ex.tobytes(),quality=90)
im=raw(); im.save('noexif.jpg',quality=90)
# baked portrait, top red
im=Image.new('RGB',(300,400),(255,255,255)); ImageDraw.Draw(im).rectangle([0,0,299,60],fill=(255,0,0)); im.save('baked-portrait.jpg',quality=90)
