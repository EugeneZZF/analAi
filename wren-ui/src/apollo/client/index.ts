import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { message } from 'antd';
import errorHandler from '@/utils/errorHandler';
import { getStoredToken } from '@/hooks/useAuth';

const authLink = setContext((_, { headers }) => {
  const token = getStoredToken();
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const apolloErrorLink = onError((error) => {
  const graphQLErrors = error.graphQLErrors || [];
  let handled = false;

  for (const err of graphQLErrors) {
    const code = err.extensions?.code;
    if (code === 'UNAUTHENTICATED') {
      handled = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('analai:unauthorized'));
      }
      break;
    }
    if (code === 'FORBIDDEN') {
      handled = true;
      const msg =
        err.message ||
        'У вас недостаточно прав для получения этих данных, обратитесь к администратору, чтобы получить доступ';
      message.error(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('analai:forbidden', { detail: msg }),
        );
      }
      break;
    }
  }

  if (!handled) {
    errorHandler(error);
  }
});

const httpLink = new HttpLink({
  uri: '/api/graphql',
});

const client = new ApolloClient({
  link: from([authLink, apolloErrorLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
