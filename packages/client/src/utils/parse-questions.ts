import type { QuestionOption, StructuredQuestion } from '@determinant/types';

export type ParsedQuestion = StructuredQuestion;

/**
 * Parse questions from the Questions artifact markdown content
 * 
 * Supports two formats:
 * 
 * 1. Answered questions (agent found concrete answer):
 * ### Question 1
 * What is the auth mechanism?
 * 
 * **Answer**: Uses JWT tokens (found in `src/auth/jwt.ts:23`)
 * 
 * **Context**: The auth middleware validates tokens...
 * 
 * 2. Decision questions (requires human input):
 * ### Question 2
 * Should we add rate limiting?
 * 
 * **Options**:
 * - **A: Add rate limiting** (Recommended)
 *   - Prevents abuse
 * - **B: Skip for now**
 *   - Simpler implementation
 * 
 * **Context**: No current rate limiting exists...
 */
export function parseQuestionsArtifact(content: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  
  // Split by ### headers (questions) and --- separators
  const questionSections = content.split(/^###\s+Question\s+(\d+)/gm);
  
  // questionSections array looks like: ['', '1', '\nQuestion content\n---\n', '2', '\nAnother question\n---\n', ...]
  // Every odd index is a question number, every even index (after first) is question content
  for (let i = 1; i < questionSections.length; i += 2) {
    const numberStr = questionSections[i];
    const rawContent = questionSections[i + 1];
    
    if (!rawContent) continue;
    
    const number = parseInt(numberStr, 10);
    const question = parseQuestionContent(number, rawContent.trim());
    
    if (question) {
      questions.push(question);
    }
  }
  
  return questions;
}

/**
 * Parse a single question's content to extract text, answer, options, and context
 */
function parseQuestionContent(number: number, content: string): ParsedQuestion | null {
  // Split by --- separator if present (remove trailing separator)
  const cleanContent = content.split(/^---+$/m)[0].trim();
  
  const lines = cleanContent.split('\n');
  
  // First non-empty line is the question text
  let text = '';
  let currentIndex = 0;
  
  while (currentIndex < lines.length && !text) {
    const line = lines[currentIndex].trim();
    if (line && !line.startsWith('**')) {
      text = line;
      currentIndex++;
      break;
    }
    currentIndex++;
  }
  
  if (!text) return null;
  
  // Parse the rest for Answer, Options, and Context
  let answer: string | undefined;
  let options: QuestionOption[] | undefined;
  let context: string | undefined;
  
  let currentSection: 'answer' | 'options' | 'context' | null = null;
  let optionsBuffer: string[] = [];
  let contextBuffer: string[] = [];
  
  for (let i = currentIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check for section headers
    if (trimmedLine.startsWith('**Answer**:')) {
      currentSection = 'answer';
      answer = trimmedLine.substring('**Answer**:'.length).trim();
      continue;
    }
    
    if (trimmedLine.startsWith('**Options**:')) {
      currentSection = 'options';
      optionsBuffer = [];
      continue;
    }
    
    if (trimmedLine.startsWith('**Context**:')) {
      currentSection = 'context';
      context = trimmedLine.substring('**Context**:'.length).trim();
      contextBuffer = context ? [context] : [];
      continue;
    }
    
    // Accumulate content for current section
    if (currentSection === 'answer' && trimmedLine) {
      answer = (answer || '') + ' ' + trimmedLine;
    }
    
    if (currentSection === 'options') {
      optionsBuffer.push(line);
    }
    
    if (currentSection === 'context' && trimmedLine) {
      contextBuffer.push(trimmedLine);
    }
  }
  
  // Parse options buffer
  if (optionsBuffer.length > 0) {
    options = parseOptions(optionsBuffer);
  }
  
  // Join context buffer
  if (contextBuffer.length > 0) {
    context = contextBuffer.join(' ');
  }
  
  return {
    number,
    text,
    answer: answer?.trim(),
    options,
    context: context?.trim(),
  };
}

/**
 * Parse options from lines like:
 * - **A: Add rate limiting** (Recommended)
 *   - Prevents abuse
 * - **B: Skip for now**
 *   - Simpler implementation
 */
function parseOptions(lines: string[]): QuestionOption[] {
  const options: QuestionOption[] = [];
  let currentOption: QuestionOption | null = null;
  let descriptionLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if this is a new option (starts with - ** followed by letter)
    const optionMatch = trimmed.match(/^-\s+\*\*([A-Za-z]):\s*(.+?)\*\*(.*)$/);
    
    if (optionMatch) {
      // Save previous option if exists
      if (currentOption) {
        if (descriptionLines.length > 0) {
          currentOption.description = descriptionLines.join(' ').trim();
        }
        options.push(currentOption);
      }
      
      // Start new option
      const [, id, label, rest] = optionMatch;
      const recommended = rest.includes('(Recommended)');
      
      currentOption = {
        id: id.toLowerCase(),
        label: label.trim(),
        recommended,
      };
      descriptionLines = [];
    } else if (currentOption && trimmed.startsWith('-')) {
      // This is a description line for current option
      descriptionLines.push(trimmed.substring(1).trim());
    }
  }
  
  // Don't forget the last option
  if (currentOption) {
    if (descriptionLines.length > 0) {
      currentOption.description = descriptionLines.join(' ').trim();
    }
    options.push(currentOption);
  }
  
  return options;
}
