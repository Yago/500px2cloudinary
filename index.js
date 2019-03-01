const fs = require('fs');
const puppeteer = require('puppeteer');
const download = require('download');
const ora = require('ora');
const cloudinary = require('cloudinary').v2;

const config = require('./config.json');

cloudinary.config(config.cloudinary);

/**
 * Helper to deal with 500px infinite scroll
 *
 * @param {*} page puppeteer page
 */
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

/**
 * Helper to format picture object attributes
 *
 * @param {object} img raw object from 500px data
 */
const formatMeta = img => ({
  id: img.id,
  title: img.name || 'unknown',
  desc: img.description || 'unknown',
  taken_with: {
    camera: img.camera || 'unknown',
    focal_length: img.focal_length || 'unknown',
    aperture: img.aperture || 'unknown',
    iso: img.iso || 'unknown',
    shutter_speed: img.shutter_speed || 'unknown',
  },
  src: img.image_url.find(i => i.includes('3D2048')),
  w: 2048,
  h: (img.height * 2048) / img.width,
});

/**
 * Main runtime
 * Use Puppeteer to scrap the user's page and retrieve image from Ajax calls
 * Upload everything to Cloudinary
 * Create pictures.json as a result
 */
(async () => {
  // Init tools
  const spinner = ora("Retrieve user's picture").start();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(`https://500px.com/${config.username}`);

  // Get first 50 pictures
  const bootstrap = await page.evaluate(() => App.bootstrap.userdata.photos);
  const pictures = bootstrap.map(img => formatMeta(img));

  // Hook on Ajax responses and push data to pictures array
  page.on('response', res => {
    if (res.url().includes('api.500px.com') && res.status() === 200) {
      res.json().then(data => {
        data.photos.forEach(img => {
          pictures.push(formatMeta(img));
        });
      });
    }
  });

  // Scroll to the infinite (or at least to the bottom)
  await autoScroll(page);

  // Push everything to Cloudinary 500px folder
  // spinner.text = 'Uploading to Cloudinary';
  // const cloudinaryPicture = [];
  // const cloudinaryPromises = pictures.map(picture => {
  //   return new Promise((resolve, reject) => {
  //     cloudinary.uploader.upload(
  //       picture.src,
  //       {
  //         public_id: `500px/${picture.id}`,
  //         context: {
  //           caption: picture.desc,
  //           alt: picture.title,
  //           ...picture.taken_with,
  //         },
  //       },
  //       (err, res) => {
  //         if (err) reject(error);
  //         cloudinaryPicture.push({ ...picture, ...res });
  //         resolve();
  //       },
  //     );
  //   });
  // });

  // await Promise.all(cloudinaryPromises);

  // console.log(pictures.map(i => i.src));

  spinner.text = 'Downloading locally';
  const downloadPromises = pictures.map(picture =>
    download(picture.src, 'download', {
      filename: `portfolio-${picture.id}.jpg`,
    }),
  );
  await Promise.all(downloadPromises);

  // Create pictures.json (can be used on your app)
  spinner.text = 'Creating pictures.json';
  fs.writeFileSync('./pictures.json', JSON.stringify(pictures), 'utf-8');

  // Conclusion
  await browser.close();
  spinner.stop();
  console.log('All pictures successfully uploaded to Cloudinary 🎉');
})();
