import { describe, expect, it } from 'vitest';
import { AUTO_YES, autoAnswer } from '../../src/runtime/confirm.ts';

describe('autoAnswer: permission questions with no options → auto-yes', () => {
  it.each([
    'Should I delete the old build folder?',
    'Should I go ahead and run npm install?',
    'Shall I proceed with the migration?',
    'May I overwrite README.md with the new version?',
    'Can I run `git reset --hard` to clean up the checkout?',
    'Do you want me to rewrite the tests to use vitest?',
    'Would you like me to install tailwindcss?',
    'Want me to remove the unused components?',
    'Is it OK to overwrite the existing package.json?',
    'Is it okay if I delete node_modules and reinstall?',
    'OK to drop the local sqlite file and recreate it?',
    'Okay to force the merge?',
    'Would it be safe to remove the legacy folder?',
    'Are you sure you want me to reset the branch?',
    'Please confirm: delete src/old/ (12 files)?',
    'Confirm you want the database reset.',
    'Proceed?',
    'Continue with the upgrade to React 19?',
    'Go ahead with the rewrite?',
    'This will delete 3 files. Proceed?',
    'The tests fail on Node 18. Should I upgrade the engines field to Node 22?',
    'I am about to run `npm audit fix --force`. OK?',
    'Mind if I restructure the src folder?',
    'Should we delete the generated files or not?',
    'Am I allowed to modify CLAUDE.md?',
    'Do I have your permission to rewrite history on this branch?',
    "I'll remove the dead code unless you object — should I?",
    'Ready for me to proceed with the cleanup?',
    'Plan: replace the router with wouter. Sound good?',
    'SHOULD I DELETE THE CACHE?',
  ])('%s', (q) => {
    expect(autoAnswer(q)).toBe(AUTO_YES);
  });
});

describe('autoAnswer: questions that need the user → asked as before', () => {
  it.each([
    // credentials, accounts, facts about the user
    'Can you give me the Stripe API key?',
    'Should I use the OPENAI_API_KEY from your .env, or do you have another one?',
    'What is the database URL for production?',
    'Do you have a Vercel account?',
    'May I have the password for the staging server?',
    'Please paste the GitHub token so I can continue.',
    'Should I log in to the npm registry with your account?',
    'Have you set up the Supabase project yet?',
    'Can I get the webhook URL?',
    'Please share the Figma link.',
    // genuine choices
    'Should I use Postgres or SQLite?',
    'Should the button be blue or green?',
    'Which port should I use for the API?',
    'What should I name the app?',
    'Where should the uploads be stored?',
    'How many items per page do you want?',
    'Should I proceed, or would you rather review the diff first?',
    'I can do A or B. Should I go with A?',
    'Done with the schema. So what colour palette do you want?',
    // free text / not a question of permission
    'Describe the tone you want for the landing page copy.',
    'The design brief is missing the target audience.',
    'Should the header stick to the top?',
    'Do you want a dark theme?',
    '',
    '   ',
  ])('%j', (q) => {
    expect(autoAnswer(q)).toBeNull();
  });
});

describe('autoAnswer: options', () => {
  it.each([
    [['Yes', 'No'], 'Yes'],
    [['yes', 'no'], 'yes'],
    [['No', 'Yes'], 'Yes'],
    [['OK', 'Cancel'], 'OK'],
    [['Proceed', 'Stop'], 'Proceed'],
    [['Continue', 'Abort'], 'Continue'],
    [['Yes, delete it', 'No, keep it'], 'Yes, delete it'],
    [['Yes — overwrite!', 'Cancel'], 'Yes — overwrite'],
    [['Overwrite', 'Keep existing'], 'Overwrite'],
    [['Install', 'Skip'], 'Install'],
    [['Delete', 'Keep'], 'Delete'],
    [['Reset the branch', "Don't reset"], 'Reset the branch'],
    [['Go ahead', 'Not now'], 'Go ahead'],
    [['Keep going', 'Stop here'], 'Keep going'],
    [['Yes', 'No', 'Cancel'], 'Yes'],
    [['1. Yes', '2. No'], '1. Yes'],
    [['✅ Approve', '❌ Reject'], '✅ Approve'],
    [['Sure', 'Nope'], 'Sure'],
  ])('%j → picks %j', (options, pick) => {
    expect(autoAnswer('Should I go ahead with this?', options)).toBe(
      `${pick}. (Auto-approved by the studio.)`,
    );
  });

  it('works with any wording of the question when the options are a yes/no pair', () => {
    expect(autoAnswer('The migration will drop the users table.', ['Proceed', 'Cancel'])).toBe(
      'Proceed. (Auto-approved by the studio.)',
    );
  });

  it.each([
    [['Postgres', 'SQLite']],
    [['Use 3000', 'Use 8080']],
    [['Yes, use Postgres', 'Yes, use SQLite', 'No']],
    [['Yes', 'Show me the diff first']],
    [['Yes', 'Yes, and also add tests']],
    [['Overwrite', 'Merge them']],
    [['Keep current design', 'Switch to the new design']],
    [['Yes']],
    [['No', 'Cancel']],
    [['Go back', 'Stay']],
  ])('%j is not a yes/no pair → asked', (options) => {
    expect(autoAnswer('Should I go ahead?', options)).toBeNull();
  });

  it('Yes/No under an either-or question is asked; an action pair under one is fine', () => {
    expect(autoAnswer('Bag or cart?', ['Yes', 'No'])).toBeNull();
    expect(autoAnswer('Overwrite the file or keep it?', ['Overwrite', 'Keep'])).toBe(
      'Overwrite. (Auto-approved by the studio.)',
    );
    expect(autoAnswer('Delete it or not?', ['Yes', 'No'])).toBe('Yes. (Auto-approved by the studio.)');
  });

  it.each([
    'Reload the app — did the fix work?',
    'Please reload the app and say if the fix worked.',
    'Did that fix the login bug?',
    'Does the page look right now?',
    'Is the chart showing up?',
    'Is everything working on your side?',
    'Can you see the new button?',
    'Does it work for you?',
    'Try it again — still broken?',
  ])('%j with Yes/No is the user’s observation → asked (a bug once auto-answered it)', (q) => {
    expect(autoAnswer(q, ['Yes', 'No'])).toBeNull();
    expect(autoAnswer(q)).toBeNull();
  });

  it('a yes/no pair about a credential or a fact about the user is still asked', () => {
    expect(autoAnswer('Do you have a Stripe account?', ['Yes', 'No'])).toBeNull();
    expect(autoAnswer('Is the API key in .env the live one?', ['Yes', 'No'])).toBeNull();
    expect(autoAnswer('Have you already bought the domain?', ['Yes', 'No'])).toBeNull();
    expect(autoAnswer('Need a Stripe test key?', ['Yes', 'No'])).toBeNull();
  });
});
