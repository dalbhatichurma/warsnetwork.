import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Extras from './extras';
import Enhance from './enhance';
import Pages from './pages';
import Fun from './fun';
import Info from './info';
import Cool from './cool';
import './style.css';
import './minecraft.css';
import './extras.css';
import './theme.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /><Extras /><Enhance /><Pages /><Fun /><Info /><Cool /></React.StrictMode>);
