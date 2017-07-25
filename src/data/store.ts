import { DataProxy } from '../data/proxy';

import { getOperationName } from '../queries/getFromAST';

import { ApolloReducerConfig } from '../store';

import { graphQLResultHasError } from './storeUtils';

import { tryFunctionOrLogError } from '../util/errorHandling';

import { ExecutionResult, DocumentNode } from 'graphql';

import { Cache, CacheWrite } from './cache';

import { InMemoryCache } from './inMemoryCache';

export class DataStore {
  private cache: Cache;
  private config: ApolloReducerConfig;

  constructor(
    config: ApolloReducerConfig,
    initialCache: Cache = new InMemoryCache(config, {}),
  ) {
    this.config = config;
    this.cache = initialCache;
  }

  public getCache(): Cache {
    return this.cache;
  }

  public markQueryResult(
    queryId: string,
    requestId: number,
    result: ExecutionResult,
    document: DocumentNode,
    variables: any,
    fetchMoreForQueryId: string | undefined,
  ) {
    // XXX handle partial result due to errors
    if (!fetchMoreForQueryId && !graphQLResultHasError(result)) {
      // TODO REFACTOR: is writeResultToStore a good name for something that doesn't actually
      // write to "the" store?
      this.cache.writeResult({
        result: result.data,
        dataId: 'ROOT_QUERY', // TODO: is this correct? what am I doing here? What is dataId for??
        document: document,
        variables: variables,
      });
    }
  }

  public markSubscriptionResult(
    subscriptionId: number,
    result: ExecutionResult,
    document: DocumentNode,
    variables: any,
  ) {
    // the subscription interface should handle not sending us results we no longer subscribe to.
    // XXX I don't think we ever send in an object with errors, but we might in the future...
    if (!graphQLResultHasError(result)) {
      // TODO REFACTOR: is writeResultToStore a good name for something that doesn't actually
      // write to "the" store?
      this.cache.writeResult({
        result: result.data,
        dataId: 'ROOT_SUBSCRIPTION',
        document: document,
        variables: variables,
      });
    }
  }

  public markMutationInit(mutation: {
    mutationId: string;
    document: DocumentNode;
    variables: any;
    update: ((proxy: DataProxy, mutationResult: Object) => void) | undefined;
    optimisticResponse: Object | Function | undefined;
  }) {
    if (mutation.optimisticResponse) {
      let optimistic: Object;
      if (typeof mutation.optimisticResponse === 'function') {
        optimistic = mutation.optimisticResponse(mutation.variables);
      } else {
        optimistic = mutation.optimisticResponse;
      }

      const changeFn = () => {
        this.markMutationResult({
          mutationId: mutation.mutationId,
          result: { data: optimistic },
          document: mutation.document,
          variables: mutation.variables,
          update: mutation.update,
        });
      };

      this.cache.recordOptimisticTransaction(c => {
        const orig = this.cache;
        this.cache = c;

        changeFn();

        this.cache = orig;
      }, mutation.mutationId);
    }
  }

  public markMutationResult(mutation: {
    mutationId: string;
    result: ExecutionResult;
    document: DocumentNode;
    variables: any;
    update: ((proxy: DataProxy, mutationResult: Object) => void) | undefined;
  }) {
    // Incorporate the result from this mutation into the store
    if (!mutation.result.errors) {
      const cacheWrites: CacheWrite[] = [];
      cacheWrites.push({
        result: mutation.result.data,
        dataId: 'ROOT_MUTATION',
        document: mutation.document,
        variables: mutation.variables,
      });

      this.cache.performTransaction(c => {
        cacheWrites.forEach(write => {
          c.writeResult(write);
        });
      });

      // If the mutation has some writes associated with it then we need to
      // apply those writes to the store by running this reducer again with a
      // write action.
      const update = mutation.update;
      if (update) {
        this.cache.performTransaction(c => {
          tryFunctionOrLogError(() => update(c, mutation.result));
        });
      }
    }
  }

  public markMutationComplete(mutationId: string) {
    this.cache.removeOptimistic(mutationId);
  }

  public markUpdateQueryResult(
    document: DocumentNode,
    variables: any,
    newResult: any,
  ) {
    this.cache.writeResult({
      result: newResult,
      dataId: 'ROOT_QUERY',
      variables,
      document,
    });
  }

  public reset(): Promise<void> {
    return this.cache.reset();
  }
}
