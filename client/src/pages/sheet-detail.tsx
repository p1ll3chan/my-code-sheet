import Layout from "@/components/layout";
import { useSheet } from "@/hooks/use-sheets";
import { useProblems, useCreateProblem, useUpdateProblem, useDeleteProblem } from "@/hooks/use-problems";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MoreHorizontal, ExternalLink, ArrowLeft, Trash2, Edit } from "lucide-react";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProblemSchema, type InsertProblem, type Problem } from "@shared/schema";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Define status colors
const STATUS_STYLES = {
  "Not Started": "bg-muted text-muted-foreground border-transparent",
  "Attempted": "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  "Solved": "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
};

export default function SheetDetail() {
  const [, params] = useRoute("/sheets/:id");
  const sheetId = parseInt(params?.id || "0");
  
  const { data: sheet, isLoading: isSheetLoading } = useSheet(sheetId);
  const { data: problems, isLoading: isProblemsLoading } = useProblems(sheetId);
  const updateMutation = useUpdateProblem();
  const deleteMutation = useDeleteProblem();

  const handleStatusChange = (problem: Problem, newStatus: string) => {
    updateMutation.mutate({ 
      id: problem.id, 
      sheetId: sheetId,
      status: newStatus 
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this problem?")) {
      deleteMutation.mutate({ id, sheetId });
    }
  };

  if (isSheetLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!sheet) return <Layout>Sheet not found</Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Link href="/sheets" className="hover:text-primary transition-colors flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Sheets
              </Link>
              <span>/</span>
              <span>Detail</span>
            </div>
            <h2 className="text-3xl font-bold font-display tracking-tight">{sheet.title}</h2>
            {sheet.description && (
              <p className="text-muted-foreground max-w-2xl">{sheet.description}</p>
            )}
          </div>
          <AddProblemDialog sheetId={sheetId} />
        </div>

        {/* Problems Table */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
                  <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[300px]">Problem</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[200px]">Notes</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isProblemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading problems...
                    </TableCell>
                  </TableRow>
                ) : problems?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No problems added yet. Click "Add Problem" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  problems?.map((problem) => (
                    <TableRow key={problem.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <a 
                            href={problem.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-primary hover:underline underline-offset-4 flex items-center gap-1.5"
                          >
                            {problem.title}
                            <ExternalLink className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs font-normal">
                          {problem.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {problem.difficulty ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                            {problem.difficulty}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {problem.topic ? (
                          <span className="text-xs text-muted-foreground">{problem.topic}</span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={cn(
                                "h-7 px-3 text-xs border transition-colors",
                                STATUS_STYLES[problem.status as keyof typeof STATUS_STYLES] || STATUS_STYLES["Not Started"]
                              )}
                            >
                              {problem.status}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {["Not Started", "Attempted", "Solved"].map((status) => (
                              <DropdownMenuItem 
                                key={status}
                                onClick={() => handleStatusChange(problem, status)}
                                className={status === problem.status ? "bg-muted" : ""}
                              >
                                {status}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                        {problem.notes || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              // Ideally open an edit modal here (omitted for brevity)
                            }}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(problem.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function AddProblemDialog({ sheetId }: { sheetId: number }) {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateProblem();
  
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Omit<InsertProblem, "sheetId">>({
    resolver: zodResolver(insertProblemSchema.omit({ sheetId: true })),
    defaultValues: {
      status: "Not Started",
      platform: "Codeforces",
    }
  });

  const onSubmit = (data: Omit<InsertProblem, "sheetId">) => {
    createMutation.mutate({ ...data, sheetId }, {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          <Plus className="mr-2 h-4 w-4" /> Add Problem
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Problem</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="title">Problem Title</Label>
              <Input id="title" placeholder="e.g. Watermelon" {...register("title")} />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </div>
            
            <div className="space-y-2 col-span-2">
              <Label htmlFor="link">Problem Link</Label>
              <Input id="link" placeholder="https://..." {...register("link")} />
              {errors.link && <p className="text-sm text-destructive">{errors.link.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Input id="difficulty" placeholder="e.g. 800 or Medium" {...register("difficulty")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" placeholder="e.g. DP, Greedy" {...register("topic")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Controller
                control={control}
                name="platform"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Codeforces">Codeforces</SelectItem>
                      <SelectItem value="AtCoder">AtCoder</SelectItem>
                      <SelectItem value="LeetCode">LeetCode</SelectItem>
                      <SelectItem value="CSES">CSES</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Not Started">Not Started</SelectItem>
                      <SelectItem value="Attempted">Attempted</SelectItem>
                      <SelectItem value="Solved">Solved</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea 
                id="notes" 
                placeholder="Key observations, time complexity, etc." 
                className="resize-none"
                {...register("notes")} 
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Problem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
