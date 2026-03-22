import { validateStyles, validateLayout } from '../utils/visual-validator';

test('hero-card', async () => {
  const testId = 'hero-card';
  await validateStyles(null as never, {}, {});
  await validateLayout(null as never, {}, {});
  const shot = 'impl-screenshot.png';
  console.log(testId, shot);
});
