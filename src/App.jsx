import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Shell from "./layout/Shell.jsx";
import Library from "./pages/Library.jsx";
import Research from "./pages/Research.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/research" replace />} />
          <Route path="/research" element={<Research />} />
          <Route path="/library" element={<Library />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
