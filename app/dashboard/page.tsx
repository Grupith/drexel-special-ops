"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, FilePlus, Package } from "lucide-react";
import { useRouter } from "next/navigation";

function getFirstName(name?: string | null) {
  if (!name) return "User";
  return name.trim().split(" ")[0];
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// REPLACE the stats section with this:
export default function DashboardPage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with User Info */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {getGreeting()},{" "}
              {getFirstName(userProfile?.displayName || user?.displayName)}!
            </h1>

            {userProfile?.createdAt && (
              <p className="text-sm text-gray-500">
                Member since{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  year: "numeric",
                }).format(userProfile.createdAt)}
              </p>
            )}
          </div>
          <Button
            size="lg"
            onClick={() => router.push("/dashboard/new")}
            className="cursor-pointer"
          >
            <FilePlus className="mr-2 h-5 w-5" />
            New Split
          </Button>
        </div>

        {/* Stats Cards - Now with User Stats */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Splits
                </CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {userProfile?.stats?.totalSplits || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Completed
                </CardTitle>
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {userProfile?.stats?.completedSplits || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">Ready to print</p>
            </CardContent>
          </Card>

          {/* ... rest of stats cards ... */}
        </div>

        {/* ... rest of existing code ... */}
      </div>
    </div>
  );
}
