const fs = require('fs');
const puppeteer = require('puppeteer');
const ora = require('ora');
const cloudinary = require('cloudinary').v2;

const config = require('./config.json');

cloudinary.config(config.cloudinary);

const autoScroll = async page => {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

const formatMeta = img => ({
  id: img.id,
  title: img.name || 'unknown',
  desc: img.description || 'unknown',
  taken_with: {
    camera: img.camera || 'unknown',
    lens: img.lens || 'unknown',
    iso: img.iso || 'unknown',
    shutter_speed: img.shutter_speed || 'unknown',
  },
  src: img.image_url.find(i => i.includes('3D2048')),
  w: 2048,
  h: (img.height * 2048) / img.width,
});

(async () => {
  const spinner = ora("Retrieve user's picture").start();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(`https://500px.com/${config.username}`);

  const bootstrap = await page.evaluate(() => App.bootstrap.userdata.photos);
  const pictures = bootstrap.map(img => formatMeta(img));

  page.on('response', res => {
    if (res.url().includes('api.500px.com') && res.status() === 200) {
      res.json().then(data => {
        data.photos.forEach(img => {
          pictures.push(formatMeta(img));
        });
      });
    }
  });

  await autoScroll(page);
  spinner.text = 'Uploading to Cloudinary';

  const cloudinaryPicture = [];
  const cloudinaryPromises = pictures.map(picture => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        picture.src,
        {
          public_id: `500px/${picture.id}`,
          context: {
            caption: picture.desc,
            alt: picture.title,
            ...picture.taken_with,
          },
        },
        (err, res) => {
          if (err) reject(error);
          cloudinaryPicture.push({ ...picture, ...res });
          resolve();
        },
      );
    });
  });

  await Promise.all(cloudinaryPromises);

  spinner.text = 'Creating pictures.json';
  fs.writeFileSync(
    './pictures.json',
    JSON.stringify(cloudinaryPicture),
    'utf-8',
  );

  await browser.close();
  spinner.stop();
  console.log('All pictures successfully uploaded to Cloudinary 🎉');
})();
