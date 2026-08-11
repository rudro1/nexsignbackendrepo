require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testCloudinary() {
  try {
    console.log("Testing Cloudinary connection...");
    const result = await cloudinary.uploader.upload("https://example.com/test.pdf", {
      resource_type: 'raw'
    });
    console.log("✅ Cloudinary connected:", result.secure_url);
  } catch (err) {
    console.error("❌ Cloudinary error:", err.message);
  }
}

testCloudinary();