import pytesseract, cv2
from PIL import Image, ImageDraw, ImageFont

print('tesseract:', pytesseract.get_tesseract_version())
# Create synthetic plate
img = Image.new('RGB',(400,100),'white')
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype('arial.ttf', 36)
except Exception:
    f = ImageFont.load_default()
text = 'DL1AB1234'
d.text((10,20), text, font=f, fill='black')
img.save('test_plate.png')
arr = cv2.imread('test_plate.png')
gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
_, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
raw = pytesseract.image_to_string(th, config='--psm 7')
print('OCR raw:', repr(raw))
