import tensorflow as tf
import numpy as np
from PIL import Image
import sys

# Load model
model = tf.keras.models.load_model('densenet121_covid_final.keras', compile=False)

# Class order
CLASSES = ["COVID", "Lung_Opacity", "Normal", "Viral Pneumonia"]

# ✏️ Pass image path as argument or hardcode it
IMG_PATH = sys.argv[1] if len(sys.argv) > 1 else 'test.png'

# Preprocess
img = Image.open(IMG_PATH).convert('RGB').resize((224, 224))
img_array = np.array(img) / 255.0
img_array = np.expand_dims(img_array, axis=0)

# Predict
preds = model.predict(img_array)[0]

print("\nResults:")
for cls, prob in zip(CLASSES, preds):
    bar = '█' * int(prob * 40)
    print(f"  {cls:20s}: {prob*100:.2f}%  {bar}")

print(f"\n✅ Predicted: {CLASSES[np.argmax(preds)]} ({max(preds)*100:.2f}% confidence)")