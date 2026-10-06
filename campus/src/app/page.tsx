import { AppProvider } from "@/components/store";
import { CalendarApp } from "@/components/CalendarApp";

export default function Home() {
  return (
    <AppProvider>
      <CalendarApp />
    </AppProvider>
  );
}
