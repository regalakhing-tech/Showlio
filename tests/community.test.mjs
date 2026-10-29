import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projects, creatorById } from '../public/assets/js/community.js';

test('project author credits link to the same creator identity', () => {
  for (const project of projects) {
    assert.equal(creatorById(project.creator)?.name, project.author, project.title);
  }
});
