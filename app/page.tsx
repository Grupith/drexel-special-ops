"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import logo from "@/public/drexel-logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect
  }
  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-10 bg-background">
      <Card className="w-full max-w-md shadow-lg border border-border bg-card py-2">
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="flex justify-center">
            <Image src={logo} alt="Drexel Logo" width={260} height={260} />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
              Special Operations App
            </CardTitle>
            <CardDescription className="text-base">
              Built for Kewaskum Receiving Team
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-2">
          <div
            onClick={() => router.push("/about")}
            className="flex items-center justify-between w-full bg-muted/30 rounded-md border border-border px-4 py-3 cursor-pointer hover:bg-muted/50 transition"
          >
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium text-foreground">
                New here?
              </span>
              <span className="text-xs text-muted-foreground">
                See how the app works before signing in
              </span>
            </div>
            <span className="text-sm font-medium underline">Learn more →</span>
          </div>
          <div className="text-center text-xs text-muted-foreground pb-1">
            Sign in with your Drexel Google account to access the app
          </div>
          <Button
            className="w-full h-11 text-base font-medium cursor-pointer"
            size="lg"
            onClick={signInWithGoogle}
          >
            <svg
              className="mr-2 h-5 w-5"
              aria-hidden="true"
              focusable="false"
              data-prefix="fab"
              data-icon="google"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 488 512"
            >
              <path
                fill="currentColor"
                d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
              ></path>
            </svg>
            Continue with Google
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Secure authentication
              </span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground pt-2">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
