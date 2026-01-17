import Layout from "@/components/layout";
import { useSheets, useCreateSheet, useDeleteSheet } from "@/hooks/use-sheets";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowRight, FileSpreadsheet, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSheetSchema, type InsertSheet } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";

export default function SheetsPage() {
  const { data: sheets, isLoading } = useSheets();
  const deleteMutation = useDeleteSheet();

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold font-display tracking-tight">Practice Sheets</h2>
            <p className="text-muted-foreground mt-2">
              Organize your problems into focused collections.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BulkUploadDialog />
            <CreateSheetDialog />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : sheets?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-muted rounded-2xl bg-muted/5">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <FileSpreadsheet className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No sheets yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm text-center">
              Create your first practice sheet to start tracking problems.
            </p>
            <CreateSheetDialog />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sheets?.map((sheet) => (
              <Card 
                key={sheet.id} 
                className="group border-border/50 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 flex flex-col"
              >
                <CardHeader>
                  <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">
                    {sheet.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[40px]">
                    {sheet.description || "No description provided."}
                  </CardDescription>
                </CardHeader>
                <div className="flex-1" />
                <CardFooter className="flex items-center justify-between pt-4 border-t bg-muted/20">
                  <div className="text-xs text-muted-foreground font-mono">
                    {sheet.createdAt && format(new Date(sheet.createdAt), 'MMM d, yyyy')}
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{sheet.title}" and all its problems.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate(sheet.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    
                    <Link href={`/sheets/${sheet.id}`}>
                      <Button size="sm" className="gap-2 group-hover:translate-x-1 transition-transform">
                        View <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function CreateSheetDialog() {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateSheet();
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<InsertSheet>({
    resolver: zodResolver(insertSheetSchema),
  });

  const onSubmit = (data: InsertSheet) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          <Plus className="mr-2 h-4 w-4" /> New Sheet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Practice Sheet</DialogTitle>
          <DialogDescription>
            Give your sheet a name and optional description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input 
              id="title" 
              placeholder="e.g., Dynamic Programming Level 1" 
              {...register("title")} 
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              placeholder="What topics does this sheet cover?" 
              className="resize-none"
              {...register("description")} 
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Sheet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkUploadDialog() {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const res = await fetch(api.sheets.bulkUpload.path, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      
      toast({
        title: "Success",
        description: `Imported ${data.total_problems} problems into "${data.sheet_name}"`,
      });
      
      queryClient.invalidateQueries({ queryKey: [api.sheets.list.path] });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload file. Ensure it's a valid Excel or CSV file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <Upload className="w-4 h-4" /> Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Import Problems</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV file containing problem links. 
            The system will auto-detect platforms and create a new sheet for you.
          </DialogDescription>
        </DialogHeader>
        <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/5 gap-4">
          <div className="bg-primary/10 p-4 rounded-full">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Click to select or drag and drop</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx or .csv files only</p>
          </div>
          <Input 
            ref={fileInputRef}
            type="file" 
            accept=".xlsx,.csv" 
            className="hidden" 
            onChange={handleUpload}
            disabled={isUploading}
          />
          <Button 
            variant="secondary" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Processing..." : "Select File"}
          </Button>
        </div>
        <div className="bg-muted/30 p-4 rounded-lg text-xs space-y-2">
          <p className="font-semibold">Expected Format:</p>
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            <li>Column A: Problem Link (Required)</li>
            <li>Optional Columns: Title, Platform, Difficulty, Topic, Notes</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
