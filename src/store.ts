import { FragmentMatcher } from 'graphql-anywhere';

import { NormalizedCache } from './data/storeUtils';

import { QueryStore } from './queries/store';

import {
  // mutations,
  MutationStore,
} from './mutations/store';

import { IdGetter } from './core/types';

import { CustomResolverMap } from './data/readFromStore';

import { assign } from './util/assign';

export type ApolloReducerConfig = {
  dataIdFromObject?: IdGetter;
  customResolvers?: CustomResolverMap;
  fragmentMatcher?: FragmentMatcher;
  addTypename?: boolean;
};
