import React from "react";
import styled from "styled-components";

// const Title = styled.h1`
//   text-align: center;
// `;

const Container = styled.div`
  max-width: 800px;
  height: 100%;
  margin: auto;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ColumnsWrapper = styled.div`
  display: flex;
  flex: 1;
  /*width: 100%;*/
`;
const Column = styled.div`
  flex: 1;
  min-height: 100px;
  border: 1px solid #fff;
  display: flex;
  flex-direction: column;
  min-width: 144px;
  overflow: auto;
  align-items: center;
  padding: 8px;
`;

interface AssemblyProps {
  // Add your props here
}

const Assembly: React.FC<AssemblyProps> = (props) => {
  return (
    <Container>
      <ColumnsWrapper>
        <Column> Column 1 content </Column>
        <Column>Column 2 content </Column>
      </ColumnsWrapper>
    </Container>
  );
};

export default Assembly;
