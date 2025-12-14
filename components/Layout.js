
import Head from 'next/head';
import Navigation from './Navigation';

export default function Layout({ children, title = 'Skye Mail Agent' }) {
    return (
        <>
            <Head>
                <title>{title}</title>
            </Head>

            <div className="app-layout">
                <Navigation dark={true} />

                <main className="main-content">
                    {children}
                </main>
            </div>

            <style jsx global>{`
        .app-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .main-content {
          flex: 1;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px;
        }
      `}</style>
        </>
    );
}
