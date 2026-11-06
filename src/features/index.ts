import { Ctx } from '../context';
import * as commit from './commit';
import * as diagnostics from './diagnostics';
import * as localHistory from './localHistory';
import * as log from './log';
import * as ops from './ops';
import * as submodules from './ops/submodules';

/** Feature modules. Each registers its commands, views and providers. */
export const FEATURES: ((ctx: Ctx) => void)[] = [commit.register, log.register, ops.register, localHistory.register, diagnostics.register, submodules.register];
