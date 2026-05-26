import { MaintenanceCommandCenter } from "@/components/maintenance-command-center";
import { AuthProvider } from "@/lib/auth-context";

export default function Home() {
  return (
    <AuthProvider>
      <MaintenanceCommandCenter />
    </AuthProvider>
  );
}
