import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
