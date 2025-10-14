/**
 * Tests for inline formatting (bold/italic) in documentation notes
 */

import { formatInlineMarkup } from '../../generators/inline-formatting.js';

// Test suite for inline formatting
const tests = [
  // Basic bold
  {
    name: 'basic bold',
    input: '**bold text**',
    expected: '<strong>bold text</strong>',
  },
  {
    name: 'basic italic (single asterisk)',
    input: '*italic text*',
    expected: '<em>italic text</em>',
  },
  {
    name: 'basic italic (underscore)',
    input: '_italic text_',
    expected: '<em>italic text</em>',
  },

  // Multiple formatting on same line
  {
    name: 'multiple bold on same line',
    input: '**bold1** and **bold2**',
    expected: '<strong>bold1</strong> and <strong>bold2</strong>',
  },
  {
    name: 'multiple italic on same line',
    input: '*italic1* and *italic2*',
    expected: '<em>italic1</em> and <em>italic2</em>',
  },
  {
    name: 'mixed bold and italic',
    input: '**bold** and *italic*',
    expected: '<strong>bold</strong> and <em>italic</em>',
  },

  // Nested formatting
  {
    name: 'italic inside bold',
    input: '**bold with *italic* inside**',
    expected: '<strong>bold with <em>italic</em> inside</strong>',
  },
  {
    name: 'bold inside italic',
    input: '*italic with **bold** inside*',
    expected: '<em>italic with <strong>bold</strong> inside</em>',
  },

  // Unclosed markers (should NOT format)
  {
    name: 'unclosed bold',
    input: '**bold but no close',
    expected: '**bold but no close',
  },
  {
    name: 'unclosed italic',
    input: '*italic but no close',
    expected: '*italic but no close',
  },
  {
    name: 'opening only at end',
    input: 'text **',
    expected: 'text **',
  },
  {
    name: 'closing only at start',
    input: '** text',
    expected: '** text',
  },

  // Empty formatting (should NOT format)
  {
    name: 'empty bold',
    input: '****',
    expected: '****',
  },
  {
    name: 'empty italic',
    input: '**',
    expected: '**',
  },
  {
    name: 'empty with content around',
    input: 'before **** after',
    expected: 'before **** after',
  },

  // Adjacent markers
  {
    name: 'quad asterisk with content',
    input: '****text****',
    expected: '****text****', // Should not parse as double-bold
  },
  {
    name: 'triple asterisk start',
    input: '***text**',
    expected: '***text**', // Ambiguous, leave as-is
  },

  // Technical text (underscores in identifiers)
  {
    name: 'underscores in variable names',
    input: 'my_variable_name should not be italic',
    expected: 'my_variable_name should not be italic',
  },
  {
    name: 'underscores with spaces around',
    input: 'my _variable_ name',
    expected: 'my <em>variable</em> name',
  },

  // Code-like text (asterisks)
  {
    name: 'SQL wildcard',
    input: 'SELECT * FROM table',
    expected: 'SELECT * FROM table',
  },
  {
    name: 'multiplication',
    input: '2 * 3 = 6',
    expected: '2 * 3 = 6',
  },

  // Multiple words
  {
    name: 'bold multiple words',
    input: '**this is bold text**',
    expected: '<strong>this is bold text</strong>',
  },
  {
    name: 'italic multiple words',
    input: '*this is italic text*',
    expected: '<em>this is italic text</em>',
  },

  // Special characters inside formatting
  {
    name: 'bold with punctuation',
    input: '**bold: text!**',
    expected: '<strong>bold: text!</strong>',
  },
  {
    name: 'italic with numbers',
    input: '*test123*',
    expected: '<em>test123</em>',
  },

  // Real-world examples from our protocol docs
  {
    name: 'protocol example - anonymous users',
    input: '**Anonymous users:** Can change nickname freely',
    expected: '<strong>Anonymous users:</strong> Can change nickname freely',
  },
  {
    name: 'protocol example - response cases',
    input: '**Response cases:** Nickname is registered',
    expected: '<strong>Response cases:</strong> Nickname is registered',
  },
  {
    name: 'protocol example - field description',
    input: 'If success: *user_id* contains the registered user ID',
    expected: 'If success: <em>user_id</em> contains the registered user ID',
  },

  // Overlapping/malformed (edge cases that could break everything)
  {
    name: 'overlapping bold and italic',
    input: '**bold *and** italic*',
    expected: '**bold *and** italic*', // Malformed, leave as-is
  },
  {
    name: 'mismatched markers',
    input: '**bold* text',
    expected: '**bold* text',
  },
  {
    name: 'many asterisks',
    input: '****** should not crash',
    expected: '****** should not crash',
  },

  // No formatting
  {
    name: 'plain text',
    input: 'just plain text',
    expected: 'just plain text',
  },
  {
    name: 'empty string',
    input: '',
    expected: '',
  },

  // Escaped HTML (should be safe)
  {
    name: 'text with HTML-like chars',
    input: '**bold <script>**',
    expected: '<strong>bold &lt;script&gt;</strong>',
  },
  {
    name: 'ampersand in bold',
    input: '**A & B**',
    expected: '<strong>A &amp; B</strong>',
  },
];

// Only run tests if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  // Run tests
  let passed = 0;
  let failed = 0;

  console.log('Running inline formatting tests...\n');

  for (const test of tests) {
    try {
      const result = formatInlineMarkup(test.input);
      if (result === test.expected) {
        passed++;
        console.log(`✓ ${test.name}`);
      } else {
        failed++;
        console.log(`✗ ${test.name}`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
      }
    } catch (error) {
      failed++;
      console.log(`✗ ${test.name} (threw error)`);
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}
