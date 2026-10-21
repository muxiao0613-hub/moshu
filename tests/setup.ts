import {configure} from '@testing-library/react';

// The note editor is a lazy chunk; on a cold jsdom worker its first import can take
// well over the 1s default, which made `npm test` fail intermittently. Keep the
// generous timeout only for async UI queries, not for individual assertions.
configure({asyncUtilTimeout:5000});
