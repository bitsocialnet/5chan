import useTheme from '../../hooks/use-theme';
import useSpecialThemeStore from '../../stores/use-special-theme-store';
import { isChristmas } from '../../lib/utils/time-utils';
import styles from './style-selector.module.css';

const StyleSelector = () => {
  const [theme, setTheme] = useTheme();
  const { isEnabled, setIsEnabled } = useSpecialThemeStore();
  const isChristmasTime = isChristmas();

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = e.target.value;

    if (newTheme === 'special') {
      setIsEnabled(true);
      setTheme('tomorrow');
    } else {
      setIsEnabled(false);
      setTheme(newTheme);
    }
  };

  return (
    <select className={styles.select} value={isEnabled ? 'special' : theme} onChange={handleThemeChange}>
      <option value='yotsuba'>Yotsuba</option>
      <option value='yotsuba-b'>Yotsuba B</option>
      <option value='futaba'>Futaba</option>
      <option value='burichan'>Burichan</option>
      <option value='tomorrow'>Tomorrow</option>
      <option value='photon'>Photon</option>
      {isChristmasTime && <option value='special'>Special</option>}
    </select>
  );
};

export default StyleSelector;
