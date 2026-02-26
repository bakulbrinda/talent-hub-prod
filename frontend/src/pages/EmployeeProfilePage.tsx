import { User } from 'lucide-react';

export default function EmployeeProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employee Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Detailed employee compensation and performance</p>
      </div>
      <div className="rounded-xl border border-dashed border-border p-16 text-center">
        <User className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Coming in Phase 1</p>
      </div>
    </div>
  );
}
