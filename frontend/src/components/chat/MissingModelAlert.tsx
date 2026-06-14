import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import { HardDriveDownload } from "lucide-react";

interface MissingModelAlertProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissingModelAlert({ isOpen, onOpenChange }: MissingModelAlertProps) {
  const router = useRouter();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-primary" />
            Embedding Model Required
          </AlertDialogTitle>
          <AlertDialogDescription>
            To process and attach documents, the backend requires an embedding model to be installed. 
            <br /><br />
            We recommend installing <strong>nomic-embed-text</strong> on your active server to enable full document search and Retrieval-Augmented Generation (RAG).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => router.push('/servers')}
          >
            Go to Servers
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
