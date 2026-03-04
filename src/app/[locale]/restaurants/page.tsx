import Footer from "../../components/Footer";
import RestaurantsPage from "../../components/restaurants/RestaurantsPage";

export default function RestaurantsRoute() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <RestaurantsPage />
      <Footer />
    </div>
  );
}
