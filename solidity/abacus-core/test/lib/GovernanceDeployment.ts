import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { assert } from 'chai';
import * as ethers from 'ethers';

import { AbacusDeployment } from './AbacusDeployment';
import { toBytes32 } from './utils';
import * as types from './types';

import {
  TestGovernanceRouter__factory,
  TestGovernanceRouter,
} from '../../typechain';

export interface GovernanceInstance {
  domain: types.Domain;
  router: TestGovernanceRouter;
}

const recoveryTimelock = 60 * 60 * 24 * 7;

export class GovernanceDeployment {
  constructor(
    public readonly domains: types.Domain[],
    public readonly instances: Record<number, GovernanceInstance>,
  ) {}

  static async fromAbacusDeployment(
    abacus: AbacusDeployment,
    signer: ethers.Signer,
  ) {
    // Deploy routers.
    const instances: Record<number, GovernanceInstance> = {};
    for (const domain of abacus.domains) {
      const instance = await GovernanceDeployment.deployInstance(
        domain,
        signer,
        abacus.connectionManager(domain).address,
      );
      instances[domain] = instance;
    }

    // Make all routers aware of eachother.
    for (const local of abacus.domains) {
      for (const remote of abacus.domains) {
        await instances[local].router.setRouterLocal(
          remote,
          toBytes32(instances[remote].router.address),
        );
      }
    }

    // Set the governor on all routers.
    for (let i = 0; i < abacus.domains.length; i++) {
      if (i > 0) {
        await instances[abacus.domains[i]].router.transferGovernor(
          abacus.domains[0],
          instances[abacus.domains[0]].router.address,
        );
      }
    }

    return new GovernanceDeployment(abacus.domains, instances);
  }

  static async deployInstance(
    domain: types.Domain,
    signer: ethers.Signer,
    connectionManagerAddress: types.Address,
  ): Promise<GovernanceInstance> {
    const routerFactory = new TestGovernanceRouter__factory(signer);
    const router = await routerFactory.deploy(domain, recoveryTimelock);
    await router.initialize(
      connectionManagerAddress,
      await signer.getAddress(),
    );
    return {
      domain,
      router,
    };
  }

  router(domain: types.Domain): TestGovernanceRouter {
    return this.instances[domain].router;
  }
}