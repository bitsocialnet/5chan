import { useState } from 'react';
import { NOT_FOUND_IMAGES } from '../../generated/asset-manifest';

const NotFoundImage = () => {
  const [imagePath] = useState(() => NOT_FOUND_IMAGES[Math.floor(Math.random() * NOT_FOUND_IMAGES.length)]);

  return <img src={imagePath} alt='' />;
};

export default NotFoundImage;
