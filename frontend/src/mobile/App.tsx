import ErrorBoundary from "../components/ErrorBoundary";
import HomeMobile from "./pages/HomeMobile";

// 移动端根组件。与桌面 App 平行、互不影响（桌面 App.tsx 零改动）。
export default function App() {
  return (
    <ErrorBoundary>
      <HomeMobile />
    </ErrorBoundary>
  );
}
