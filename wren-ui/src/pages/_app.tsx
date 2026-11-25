import { AppProps } from 'next/app';
import Head from 'next/head';
import { Spin } from 'antd';
import posthog from 'posthog-js';
import apolloClient from '@/apollo/client';
import { GlobalConfigProvider } from '@/hooks/useGlobalConfig';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider } from '@/hooks/useI18n';
import { PostHogProvider } from 'posthog-js/react';
import { ApolloProvider } from '@apollo/client';
import { defaultIndicator } from '@/components/PageLoading';

require('../styles/index.less');

Spin.setDefaultIndicator(defaultIndicator);

function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Wren AI</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <GlobalConfigProvider>
        <I18nProvider>
          <AuthProvider>
            <ApolloProvider client={apolloClient}>
              <PostHogProvider client={posthog}>
                <main className="app">
                  <Component {...pageProps} />
                </main>
              </PostHogProvider>
            </ApolloProvider>
          </AuthProvider>
        </I18nProvider>
      </GlobalConfigProvider>
    </>
  );
}

export default App;
