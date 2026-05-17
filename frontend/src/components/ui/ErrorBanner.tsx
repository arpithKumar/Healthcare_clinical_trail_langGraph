import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-2xl"
    >
      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
      <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
        {message}
      </p>
    </motion.div>
  );
}
