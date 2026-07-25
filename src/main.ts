import 'tek-ms-ds/dist/style.css';
import { Stats } from './stats';

const app = document.querySelector<HTMLDivElement>('#app')!;

const stats = new Stats(app, {
  sellers: [
    {
      name: 'Awa Diop',
      zone: 'Dakar',
      phone: '77 000 00 00',
      sales: { day: 45000, week: 210000, month: 980000, year: 9800000 },
    },
    {
      name: 'Moussa Ba',
      zone: 'Thiès',
      phone: '76 111 11 11',
      sales: { day: 62000, week: 340000, month: 1250000, year: 12500000 },
    },
    {
      name: 'Fatou Sarr',
      zone: 'Saint-Louis',
      phone: '78 222 22 22',
      sales: { day: 30000, week: 150000, month: 700000, year: 7000000 },
    },
  ],
});

stats.render();
