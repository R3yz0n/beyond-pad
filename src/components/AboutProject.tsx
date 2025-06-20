import React from "react";

const AboutProject = () => {
  return (
    <div className="relative overflow-hidden ">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-800/30 to-pink-800/30"></div>
      <div className="relative container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent animate-float">
            Beyond Editor
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
            The future of content creation in Web3. Connect your wallet and start building amazing
            experiences.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-blue-500/30 rounded-lg px-6 py-3">
              <span className="text-blue-300 text-sm font-medium">
                ✨ Powered by Web3 Technology
              </span>
            </div>
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm border border-green-500/30 rounded-lg px-6 py-3">
              <span className="text-green-300 text-sm font-medium">🚀 Real-time Collaboration</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutProject;
