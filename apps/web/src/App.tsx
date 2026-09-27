import { NavLink, Navigate, Route, Routes } from 'react-router';
import { PlanogramsPage } from './pages/PlanogramsPage';
import { EditorPage } from './pages/EditorPage';
import { ProductsPage } from './pages/ProductsPage';
import { StoresPage } from './pages/StoresPage';

export function App() {
  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <span>PVM</span>
          <small>Plano-Visual-Merch</small>
        </div>
        <nav>
          <NavLink to="/planograms">Planograms</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/stores">Stores</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/planograms" replace />} />
          <Route path="/planograms" element={<PlanogramsPage />} />
          <Route path="/planograms/:id" element={<EditorPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/stores" element={<StoresPage />} />
          <Route path="*" element={<p className="page">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
