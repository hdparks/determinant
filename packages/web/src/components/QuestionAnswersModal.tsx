import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useApproveQuestions } from '../hooks/use-approve-questions';
import { parseQuestionsArtifact } from '../lib/parse-questions';
import type { QueueItem } from '@determinant/types';
import { useTask } from '../hooks/use-tasks';

interface QuestionAnswersModalProps {
  queueItem: QueueItem;
  isOpen: boolean;
  onClose: () => void;
}

interface AnswerState {
  selectedOptionId?: string;
  customAnswer?: string;
  comments?: string;
}

export function QuestionAnswersModal({ 
  queueItem, 
  isOpen, 
  onClose 
}: QuestionAnswersModalProps) {
  // Fetch full task data to get all nodes
  const { data: taskData, isLoading: isLoadingTask, error: taskError } = useTask(queueItem.task.id);
  
  // Find the Questions node (parent of QuestionAnswers node)
  const questionsNode = taskData?.nodes.find(n => 
    n.id === queueItem.node.parentNodeId && n.toStage === 'Questions'
  );
  
  // Parse questions from Questions artifact
  const questions = questionsNode 
    ? parseQuestionsArtifact(questionsNode.content)
    : [];
  
  // Form state: map of question number -> answer state
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  
  const { mutate: approve, isPending } = useApproveQuestions();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all questions have answers
    const allAnswered = questions.every(q => {
      const answer = answers[q.number];
      // Question is answered if it has a concrete answer from agent, 
      // or user selected an option, or provided custom answer
      return q.answer || answer?.selectedOptionId || answer?.customAnswer?.trim();
    });
    
    if (!allAnswered) {
      toast.error('Please answer all questions');
      return;
    }
    
    // Submit
    approve(
      {
        nodeId: queueItem.node.id,
        data: {
          answers: questions.map(q => ({
            questionNumber: q.number,
            question: q.text,
            selectedOptionId: answers[q.number]?.selectedOptionId,
            // Use user's custom answer if provided, otherwise fall back to agent's answer
            customAnswer: answers[q.number]?.customAnswer?.trim() || q.answer,
            // Include comments if provided
            comments: answers[q.number]?.comments?.trim(),
          })),
        },
      },
      {
        onSuccess: () => {
          toast.success('Questions approved successfully');
          onClose();
        },
        onError: (error) => {
          toast.error(`Failed to approve: ${error.message}`);
        },
      }
    );
  };
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6">
          
          <Dialog.Title className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Review Questions - {queueItem.task.vibe}
          </Dialog.Title>
          
          {taskError ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error loading questions: {taskError.message}
            </div>
          ) : isLoadingTask ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Loading questions...
            </div>
          ) : !questionsNode ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error: Could not find Questions node (parent node ID: {queueItem.node.parentNodeId})
            </div>
          ) : questions.length === 0 ? (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              No questions found in this task.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="space-y-6 mb-6">
                {questions.map((question) => (
                  <div key={question.number} className="space-y-3 border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white">
                        Question {question.number}
                      </label>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {question.text}
                      </p>
                    </div>
                    
                    {/* If agent found an answer, show it */}
                    {question.answer && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                        <div className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                          ✓ Agent found answer:
                        </div>
                        <div className="text-sm text-green-900 dark:text-green-100">
                          {question.answer}
                        </div>
                      </div>
                    )}
                    
                    {/* If agent provided options, show them */}
                    {question.options && question.options.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Select an option:
                        </div>
                        {question.options.map((option) => (
                          <label
                            key={option.id}
                            className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`question-${question.number}`}
                              value={option.id}
                              checked={answers[question.number]?.selectedOptionId === option.id}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                [question.number]: {
                                  ...prev[question.number],
                                  selectedOptionId: e.target.value,
                                  customAnswer: undefined,
                                },
                              }))}
                              className="mt-0.5"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {option.label}
                                {option.recommended && (
                                  <span className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                    (Recommended)
                                  </span>
                                )}
                              </div>
                              {option.description && (
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {option.description}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    
                    {/* Context from agent */}
                    {question.context && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-md p-3">
                        <span className="font-medium">Context:</span> {question.context}
                      </div>
                    )}
                    
                    {/* Custom answer input (always available unless agent already found answer) */}
                    {!question.answer && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {question.options?.length ? 'Or provide custom answer:' : 'Your answer:'}
                        </div>
                        <textarea
                          value={answers[question.number]?.customAnswer || ''}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            [question.number]: {
                              ...prev[question.number],
                              selectedOptionId: undefined,
                              customAnswer: e.target.value,
                            },
                          }))}
                          placeholder={question.options?.length ? "Custom answer..." : "Enter your answer..."}
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    
                    {/* Comments field - always available for all questions */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Comments (optional)
                      </label>
                      <textarea
                        value={answers[question.number]?.comments || ''}
                        onChange={(e) => setAnswers(prev => ({
                          ...prev,
                          [question.number]: {
                            ...prev[question.number],
                            comments: e.target.value,
                          },
                        }))}
                        placeholder="Add any additional notes or context..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? 'Submitting...' : 'Submit Answers'}
                </button>
              </div>
            </form>
          )}
          
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
